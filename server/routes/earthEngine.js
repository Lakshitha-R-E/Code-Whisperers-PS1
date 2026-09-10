import express from 'express';
import { readFileSync } from 'fs';
import ee from '@google/earthengine';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// Google Earth Engine — live NDVI/LULC classification
//
// Ports the exact classification logic already validated in the Earth Engine
// Code Editor (Landsat 8+9, cloud-masked, NDVI/NDWI thresholds → 4 classes).
// Authenticated via a GCP service account private key (JSON key file).
//
// ENV VAR: EE_SERVICE_ACCOUNT_KEY_PATH — path to the JSON key file
//          downloaded from the GCP console for the service account.
// ═══════════════════════════════════════════════════════════════════════════

// The 4 real watershed bounding boxes (same as used elsewhere in the app).
const WATERSHED_BOUNDS = {
  'ws-001': { name: 'Chambal Upper Sub-Basin',         lngMin: 77.9, lngMax: 78.4, latMin: 26.5, latMax: 26.9 },
  'ws-002': { name: 'Banas Watershed — Tonk Block',    lngMin: 75.6, lngMax: 76.1, latMin: 25.8, latMax: 26.2 },
  'ws-003': { name: 'Mahi Bajaj Sagar — Dungarpur Zone', lngMin: 73.6, lngMax: 74.1, latMin: 23.6, latMax: 23.95 },
  'ws-004': { name: 'Wainganga Headwaters — Balaghat',  lngMin: 80.1, lngMax: 80.6, latMin: 21.7, latMax: 22.1 },
};

// ── In-memory cache ──────────────────────────────────────────────────────────
// Keyed by "ws-001:2026", value = { data, expiresAt }.
// 1-hour TTL — Earth Engine computation is not free/instant.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  if (entry) cache.delete(key); // expired
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── EE initialisation (singleton) ────────────────────────────────────────────
let eeReady = null; // Promise that resolves once EE is authenticated + initialised

// Loads the service account key from either of two sources:
//  1. EE_SERVICE_ACCOUNT_KEY_PATH — path to a JSON key file (original
//     approach; works on platforms that support secret files, e.g. Render).
//  2. EE_SERVICE_ACCOUNT_KEY_JSON — the raw JSON key content as a single
//     environment variable value (added for platforms that only support
//     plain env vars, not secret files — Railway, Fly.io, Heroku, etc.)
// Checked in that order; the first one present wins. Returns null if
// neither is set, which callers treat as "not configured".
function loadKeyData() {
  const keyPath = process.env.EE_SERVICE_ACCOUNT_KEY_PATH;
  if (keyPath) {
    return JSON.parse(readFileSync(keyPath, 'utf-8'));
  }
  const keyJson = process.env.EE_SERVICE_ACCOUNT_KEY_JSON;
  if (keyJson) {
    return JSON.parse(keyJson);
  }
  return null;
}

function isEeConfigured() {
  return Boolean(process.env.EE_SERVICE_ACCOUNT_KEY_PATH || process.env.EE_SERVICE_ACCOUNT_KEY_JSON);
}

function ensureEeInitialised() {
  if (eeReady) return eeReady;

  // NOTE: Read env vars lazily — ES module imports resolve before
  // dotenv.config() runs in index.js (see comment in auth.js for details).
  if (!isEeConfigured()) {
    return Promise.reject(new Error('not_configured'));
  }

  let keyData;
  try {
    keyData = loadKeyData();
  } catch (err) {
    return Promise.reject(
      new Error(`Failed to read Earth Engine service account credentials: ${err.message}`)
    );
  }

  eeReady = new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      keyData,
      () => {
        // Authentication succeeded — now initialise.
        // Pass the project ID so EE knows which Cloud project to bill.
        ee.initialize(
          null,  // opt_baseurl
          null,  // opt_tileurl
          () => resolve(),           // success
          (err) => {                 // failure
            eeReady = null; // allow retry
            reject(new Error(`Earth Engine initialisation failed: ${err}`));
          },
          null,  // opt_xsrfToken
          keyData.project_id  // opt_project
        );
      },
      (err) => {
        eeReady = null; // allow retry
        reject(new Error(`Earth Engine authentication failed: ${err}`));
      }
    );
  });

  return eeReady;
}

// ── Classification logic (ported exactly from validated EE Code Editor) ──────

// Cloud mask using QA_PIXEL bits 3 (cloud shadow) and 4 (cloud) — shared by
// both computeLulc() and computePointAnalysis() below.
function maskClouds(img) {
  const qa = img.select('QA_PIXEL');
  const cloudShadowBit = 1 << 3;
  const cloudBit = 1 << 4;
  const mask = qa.bitwiseAnd(cloudShadowBit).eq(0)
    .and(qa.bitwiseAnd(cloudBit).eq(0));
  return img.updateMask(mask);
}

// Scale surface reflectance bands — shared by both functions below.
function scaleImage(img) {
  const opticalBands = img.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5'])
    .multiply(0.0000275).add(-0.2);
  return img.addBands(opticalBands, null, true);
}

function computeLulc(watershedId, year) {
  const bounds = WATERSHED_BOUNDS[watershedId];
  const roi = ee.Geometry.Rectangle([
    bounds.lngMin, bounds.latMin,
    bounds.lngMax, bounds.latMax,
  ]);

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // Merge Landsat 8 and 9, filter, cloud-mask, scale, median composite
  const l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(roi).filterDate(startDate, endDate);
  const l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(roi).filterDate(startDate, endDate);

  const composite = l8.merge(l9)
    .map(maskClouds)
    .map(scaleImage)
    .median()
    .clip(roi);

  // Classification — exact same thresholds as the validated script
  const ndvi = composite.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
  const ndwi = composite.normalizedDifference(['SR_B3', 'SR_B5']).rename('NDWI');

  const classified = ee.Image(0)
    .where(ndwi.gt(0), 1)                                             // Water
    .where(ndwi.lte(0).and(ndvi.gt(0.40)), 2)                         // Forest
    .where(ndwi.lte(0).and(ndvi.gt(0.15)).and(ndvi.lte(0.40)), 3)     // Agricultural
    .where(ndwi.lte(0).and(ndvi.lte(0.15)), 4)                        // Barren/Degraded
    .rename('class')
    .clip(roi);

  // Frequency histogram at 30m resolution
  const histogram = classified.reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e9,
  });

  // Real, genuine additional output: mean NDWI across the watershed.
  // IMPORTANT — this is NOT true soil moisture. Actual soil moisture
  // measurement needs SAR/radar data (e.g. Sentinel-1) or a dedicated
  // mission (SMAP/SMOS), which this project does not integrate. NDWI is a
  // real, standard optical remote-sensing index correlated with surface
  // wetness/vegetation water content — a legitimate, defensible proxy,
  // computed from the exact same live Landsat composite already being
  // fetched for the classification above (no extra request needed).
  const ndwiMean = ndwi.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e9,
  });

  return new Promise((resolve, reject) => {
    ee.Dictionary({ hist: histogram, ndwi: ndwiMean }).evaluate((result, err) => {
      if (err) return reject(new Error(`Earth Engine computation failed: ${err}`));

      try {
        const hist = result?.hist?.class || {};
        // hist looks like { "0": count, "1": count, "2": count, ... }
        // Class 0 = unclassified (should be minimal), 1=Water, 2=Forest, 3=Agri, 4=Barren
        const counts = {};
        let total = 0;
        for (const [cls, count] of Object.entries(hist)) {
          counts[cls] = count;
          total += count;
        }

        if (total === 0) {
          return reject(new Error('No valid pixels found — the composite may be empty for this date range.'));
        }

        const pct = (cls) => {
          const raw = ((counts[String(cls)] || 0) / total) * 100;
          return Math.round(raw * 10) / 10; // 1 decimal place
        };

        const ndwiValue = typeof result?.ndwi?.NDWI === 'number' ? Math.round(result.ndwi.NDWI * 1000) / 1000 : null;
        // Simple qualitative bucketing of the real NDWI value — not a
        // percentage, not a fabricated "X% soil moisture" figure.
        let moistureProxyCategory = 'Unknown';
        if (ndwiValue !== null) {
          moistureProxyCategory = ndwiValue > 0.1 ? 'High (surface water dominant)'
            : ndwiValue > -0.1 ? 'Moderate'
            : 'Low (dry/vegetated-dry surface)';
        }

        resolve({
          watershed_id: watershedId,
          year: Number(year),
          forest_pct: pct(2),
          agricultural_pct: pct(3),
          water_bodies_pct: pct(1),
          barren_degraded_pct: pct(4),
          moisture_proxy_ndwi: ndwiValue,
          moisture_proxy_category: moistureProxyCategory,
          moisture_proxy_disclaimer: 'NDWI-based wetness proxy — NOT true soil moisture, which requires SAR/radar data (e.g. Sentinel-1) not integrated in this prototype.',
          source: 'live',
          computed_at: new Date().toISOString(),
        });
      } catch (parseErr) {
        reject(new Error(`Failed to parse Earth Engine result: ${parseErr.message}`));
      }
    });
  });
}

// ── Point-buffer analysis (connects an image's location to Earth Engine) ────
// Unlike computeLulc() above (fixed watershed rectangles), this runs on ANY
// lat/lng with a configurable radius — the spatial anchor for a geo-coded
// field photo's location, not a whole watershed.
const VALID_RADII_M = [250, 500, 1000];

function computePointAnalysis(lat, lng, radiusM) {
  const point = ee.Geometry.Point([lng, lat]);
  const roi = point.buffer(radiusM);

  const end = ee.Date(Date.now());
  const start = end.advance(-1, 'year'); // most recent 1-year composite

  const composite = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterDate(start, end)
    .filterBounds(roi)
    .map(maskClouds)
    .map(scaleImage)
    .median()
    .clip(roi);

  const ndvi = composite.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
  const ndwi = composite.normalizedDifference(['SR_B3', 'SR_B5']).rename('NDWI');

  const classified = ee.Image(0)
    .where(ndwi.gt(0), 1)
    .where(ndwi.lte(0).and(ndvi.gt(0.40)), 2)
    .where(ndwi.lte(0).and(ndvi.gt(0.15)).and(ndvi.lte(0.40)), 3)
    .where(ndwi.lte(0).and(ndvi.lte(0.15)), 4)
    .rename('class')
    .clip(roi);

  const ndviStats = ndvi.reduceRegion({
    reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true }),
    geometry: roi, scale: 30, maxPixels: 1e8,
  });
  const ndwiStats = ndwi.reduceRegion({
    reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true }),
    geometry: roi, scale: 30, maxPixels: 1e8,
  });
  const histogram = classified.reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: roi, scale: 30, maxPixels: 1e8,
  });

  return new Promise((resolve, reject) => {
    ee.Dictionary({ ndvi: ndviStats, ndwi: ndwiStats, hist: histogram }).evaluate((result, err) => {
      if (err) return reject(new Error(`Earth Engine computation failed: ${err}`));
      try {
        const hist = result?.hist?.class || {};
        const counts = {};
        let total = 0;
        for (const [cls, count] of Object.entries(hist)) { counts[cls] = count; total += count; }

        if (total === 0) {
          return reject(new Error('No valid pixels found in this buffer — imagery may be unavailable for this location/date range.'));
        }

        const CLASS_NAMES = { 1: 'Water', 2: 'Forest', 3: 'Agricultural', 4: 'Barren/Degraded' };
        let dominantClass = 'Unknown', dominantCount = 0;
        for (const [cls, count] of Object.entries(counts)) {
          if (count > dominantCount) { dominantCount = count; dominantClass = CLASS_NAMES[cls] || 'Unclassified'; }
        }
        const classPercentages = {};
        for (const [cls, name] of Object.entries(CLASS_NAMES)) {
          classPercentages[name] = Math.round(((counts[cls] || 0) / total) * 1000) / 10;
        }

        const round3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : null);

        resolve({
          lat, lng, radius_m: radiusM,
          ndvi: { mean: round3(result?.ndvi?.NDVI_mean), min: round3(result?.ndvi?.NDVI_min), max: round3(result?.ndvi?.NDVI_max) },
          ndwi: { mean: round3(result?.ndwi?.NDWI_mean), min: round3(result?.ndwi?.NDWI_min), max: round3(result?.ndwi?.NDWI_max) },
          lulc_dominant_class: dominantClass,
          lulc_class_percentages: classPercentages,
          source: 'live',
          dataset: 'Landsat 8/9 (LANDSAT/LC08+LC09/C02/T1_L2)',
          spatial_resolution_m: 30,
          computed_at: new Date().toISOString(),
        });
      } catch (parseErr) {
        reject(new Error(`Failed to parse Earth Engine result: ${parseErr.message}`));
      }
    });
  });
}

// ── Route ────────────────────────────────────────────────────────────────────

router.get('/lulc/:watershedId', async (req, res) => {
  // Lazy check — same pattern as auth.js
  if (!isEeConfigured()) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Earth Engine credentials are not set — set EE_SERVICE_ACCOUNT_KEY_PATH or EE_SERVICE_ACCOUNT_KEY_JSON in server/.env — see server/.env.example.',
    });
  }

  const { watershedId } = req.params;
  const year = req.query.year || new Date().getFullYear().toString();

  // Validate watershed ID
  if (!WATERSHED_BOUNDS[watershedId]) {
    return res.status(400).json({
      error: 'invalid_watershed',
      message: `Unknown watershed ID "${watershedId}". Valid IDs: ${Object.keys(WATERSHED_BOUNDS).join(', ')}`,
    });
  }

  // Validate year
  if (!/^\d{4}$/.test(year) || Number(year) < 2013 || Number(year) > new Date().getFullYear()) {
    return res.status(400).json({
      error: 'invalid_year',
      message: `Year must be a 4-digit number between 2013 and ${new Date().getFullYear()} (Landsat 8 launched in 2013).`,
    });
  }

  // Check cache
  const cacheKey = `${watershedId}:${year}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    await ensureEeInitialised();
    const result = await computeLulc(watershedId, year);
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.message === 'not_configured') {
      return res.status(503).json({
        error: 'not_configured',
        message: 'Earth Engine credentials are not set — set EE_SERVICE_ACCOUNT_KEY_PATH or EE_SERVICE_ACCOUNT_KEY_JSON in server/.env — see server/.env.example.',
      });
    }
    console.error('[Earth Engine] Error:', err.message);
    res.status(500).json({ error: 'computation_failed', message: err.message });
  }
});

// Point-buffer analysis — connects an uploaded geo-coded image's location
// (from EXIF, OCR, or manual selection) to live Earth Engine analysis.
router.get('/point-analysis', async (req, res) => {
  if (!isEeConfigured()) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Earth Engine credentials are not set — set EE_SERVICE_ACCOUNT_KEY_PATH or EE_SERVICE_ACCOUNT_KEY_JSON in server/.env — see server/.env.example.',
    });
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius || 500);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'invalid_coordinates', message: 'lat/lng query params must be valid coordinates.' });
  }
  if (!VALID_RADII_M.includes(radius)) {
    return res.status(400).json({ error: 'invalid_radius', message: `radius must be one of: ${VALID_RADII_M.join(', ')} (metres).` });
  }

  const cacheKey = `point:${lat.toFixed(4)}:${lng.toFixed(4)}:${radius}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    await ensureEeInitialised();
    const result = await computePointAnalysis(lat, lng, radius);
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.message === 'not_configured') {
      return res.status(503).json({
        error: 'not_configured',
        message: 'Earth Engine credentials are not set — set EE_SERVICE_ACCOUNT_KEY_PATH or EE_SERVICE_ACCOUNT_KEY_JSON in server/.env — see server/.env.example.',
      });
    }
    console.error('[Earth Engine] Point analysis error:', err.message);
    res.status(500).json({ error: 'computation_failed', message: err.message });
  }
});

export default router;