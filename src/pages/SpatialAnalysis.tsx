import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getWatersheds } from '../services/watershedService';
import { getLulcTrendByWatershed } from '../services/gisService';
import LulcTrendChart from '../components/LulcTrendChart';
import type { WatershedFeature, LulcTrendEntry } from '../types';
import { TrendingUp, TrendingDown, Info, Satellite, Loader2, AlertTriangle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const SpatialAnalysis: React.FC = () => {
  const [watersheds, setWatersheds] = useState<WatershedFeature[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string>('');
  const [trendData, setTrendData] = useState<LulcTrendEntry | null>(null);

  // ── Live Earth Engine state ──────────────────────────────────────────────
  interface LiveLulcResult {
    watershed_id: string;
    year: number;
    forest_pct: number;
    agricultural_pct: number;
    water_bodies_pct: number;
    barren_degraded_pct: number;
    moisture_proxy_ndwi: number | null;
    moisture_proxy_category: string;
    moisture_proxy_disclaimer: string;
    source: string;
    computed_at: string;
  }
  const [liveResult, setLiveResult] = useState<LiveLulcResult | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    getWatersheds().then(ws => {
      setWatersheds(ws);
      if (ws.length > 0) {
        setSelectedWsId(ws[0].properties.id);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedWsId) {
      getLulcTrendByWatershed(selectedWsId).then(data => {
        setTrendData(data ?? null);
      });
    }
  }, [selectedWsId]);

  // Reset live result when watershed changes
  useEffect(() => {
    setLiveResult(null);
    setLiveError(null);
  }, [selectedWsId]);

  const handleComputeLive = useCallback(async () => {
    if (!selectedWsId || liveLoading) return;
    setLiveLoading(true);
    setLiveError(null);
    setLiveResult(null);
    try {
      const currentYear = new Date().getFullYear();
      const res = await fetch(
        `${API_BASE}/api/earth-engine/lulc/${selectedWsId}?year=${currentYear}`
      );
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error === 'not_configured'
          ? 'Earth Engine is not configured on the backend. Set EE_SERVICE_ACCOUNT_KEY_PATH in server/.env — see server/.env.example.'
          : data.message || `Server error (${res.status})`;
        setLiveError(msg);
      } else {
        setLiveResult(data);
      }
    } catch (err) {
      setLiveError(
        'Could not reach the backend server. Make sure it is running on port 4000 (cd server && npm run dev).'
      );
    } finally {
      setLiveLoading(false);
    }
  }, [selectedWsId, liveLoading]);

  // Derived metrics for summary cards
  const metrics = useMemo(() => {
    if (!trendData || trendData.years.length === 0) return null;

    const firstYearIdx = 0;
    const lastYearIdx = trendData.years.length - 1;

    // Forest changes
    const firstForest = trendData.forest_pct[firstYearIdx];
    const lastForest = trendData.forest_pct[lastYearIdx];
    const forestDiff = lastForest - firstForest;

    // Water changes
    const firstWater = trendData.water_bodies_pct[firstYearIdx];
    const lastWater = trendData.water_bodies_pct[lastYearIdx];
    const waterDiff = lastWater - firstWater;

    // Agricultural changes
    const firstAgri = trendData.agricultural_pct[firstYearIdx];
    const lastAgri = trendData.agricultural_pct[lastYearIdx];
    const agriDiff = lastAgri - firstAgri;

    // Barren changes
    const firstBarren = trendData.barren_degraded_pct[firstYearIdx];
    const lastBarren = trendData.barren_degraded_pct[lastYearIdx];
    const barrenDiff = lastBarren - firstBarren;

    return {
      forestDiff,
      waterDiff,
      agriDiff,
      barrenDiff,
      firstYear: trendData.years[firstYearIdx],
      lastYear: trendData.years[lastYearIdx],
    };
  }, [trendData]);

  const selectedWs = watersheds.find(w => w.properties.id === selectedWsId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="border-b border-gray-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-dark">Spatial Analysis &amp; Change Detection</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Compare land cover classification patterns over time
          </p>
        </div>

        {/* Watershed Selector + Compute Live */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Selected Watershed:</label>
          <select
            value={selectedWsId}
            onChange={e => setSelectedWsId(e.target.value)}
            className="text-sm border border-gray-200 rounded px-3 py-2 bg-white text-text-dark font-medium shadow-sm focus:outline-none focus:border-primary-400"
          >
            {watersheds.map(w => (
              <option key={w.properties.id} value={w.properties.id}>
                {w.properties.name} ({w.properties.district})
              </option>
            ))}
          </select>

          <button
            onClick={handleComputeLive}
            disabled={liveLoading || !selectedWsId}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded shadow-sm transition-colors
              bg-emerald-600 text-white hover:bg-emerald-700
              disabled:opacity-50 disabled:cursor-not-allowed"
            title="Run live NDVI/LULC classification via Google Earth Engine"
          >
            {liveLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Satellite className="w-4 h-4" />
            )}
            {liveLoading ? 'Computing…' : 'Compute Live'}
          </button>
        </div>
      </div>

      {/* Government Warning Label */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-primary-800 font-semibold">Important System Note</p>
          <p className="text-xs text-primary-700 mt-0.5 leading-relaxed">
            Illustrative analysis based on pre-classified vector layers for SIH demonstration purposes. This prototype does not perform real-time active remote-sensing satellite imagery computation or cloud extraction.
          </p>
        </div>
      </div>

      {trendData && metrics && selectedWs && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trend Chart */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-dark">Land Use / Land Cover Trend</h2>
                <p className="text-xs text-gray-500 mt-0.5">Temporal change detection across 2020, 2023, and 2026</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded font-semibold uppercase tracking-wider">
                  GIS / Reference Data
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded font-semibold">
                  Area: {selectedWs.properties.area_sq_km} km²
                </span>
              </div>
            </div>
            
            <div className="pt-2">
              <LulcTrendChart data={trendData} type="area" />
            </div>
          </div>

          {/* Change Summaries */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-text-dark uppercase tracking-wider">
              Change Summary ({metrics.firstYear} vs {metrics.lastYear})
            </h2>

            {/* Forest Card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-start justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Forest Cover</span>
                <p className="text-lg font-bold text-text-dark mt-0.5">
                  {trendData.forest_pct[trendData.forest_pct.length - 1]}%
                </p>
                <span className="text-xs text-gray-500">of total watershed area</span>
              </div>
              <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                metrics.forestDiff >= 0 ? 'bg-tertiary-50 text-tertiary-700' : 'bg-accent-50 text-accent-700'
              }`}>
                {metrics.forestDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {metrics.forestDiff >= 0 ? '+' : ''}{metrics.forestDiff.toFixed(1)}%
              </div>
            </div>

            {/* Water Body Card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-start justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Water Bodies</span>
                <p className="text-lg font-bold text-text-dark mt-0.5">
                  {trendData.water_bodies_pct[trendData.water_bodies_pct.length - 1]}%
                </p>
                <span className="text-xs text-gray-500">surface water percentage</span>
              </div>
              <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                metrics.waterDiff >= 0 ? 'bg-tertiary-50 text-tertiary-700' : 'bg-accent-50 text-accent-700'
              }`}>
                {metrics.waterDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {metrics.waterDiff >= 0 ? '+' : ''}{metrics.waterDiff.toFixed(1)}%
              </div>
            </div>

            {/* Agriculture Card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-start justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Agricultural Land</span>
                <p className="text-lg font-bold text-text-dark mt-0.5">
                  {trendData.agricultural_pct[trendData.agricultural_pct.length - 1]}%
                </p>
                <span className="text-xs text-gray-500">crop &amp; fallow fields</span>
              </div>
              <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                metrics.agriDiff >= 0 ? 'bg-tertiary-50 text-tertiary-700' : 'bg-accent-50 text-accent-700'
              }`}>
                {metrics.agriDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {metrics.agriDiff >= 0 ? '+' : ''}{metrics.agriDiff.toFixed(1)}%
              </div>
            </div>

            {/* Barren Card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-start justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Barren / Degraded</span>
                <p className="text-lg font-bold text-text-dark mt-0.5">
                  {trendData.barren_degraded_pct[trendData.barren_degraded_pct.length - 1]}%
                </p>
                <span className="text-xs text-gray-500">wasteland reclamation target</span>
              </div>
              <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                metrics.barrenDiff <= 0 ? 'bg-tertiary-50 text-tertiary-700' : 'bg-accent-50 text-accent-700'
              }`}>
                {metrics.barrenDiff <= 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                {metrics.barrenDiff >= 0 ? '+' : ''}{metrics.barrenDiff.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GIS Data table summary */}
      {trendData && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-text-dark mb-3">Classification Matrix (% of total area)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider text-right">
                  <th className="text-left pb-2 font-semibold">Classification Zone</th>
                  {trendData.years.map(yr => <th key={yr} className="pb-2 font-semibold">{yr}</th>)}
                  <th className="pb-2 font-semibold">Net Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-right">
                <tr>
                  <td className="text-left py-2 font-medium text-gray-700">Forest / Vegetation</td>
                  {trendData.forest_pct.map((pct, i) => <td key={i} className="py-2 text-gray-600">{pct}%</td>)}
                  <td className={`py-2 font-bold ${metrics?.forestDiff && metrics.forestDiff >= 0 ? 'text-tertiary-600' : 'text-accent-600'}`}>
                    {metrics && (metrics.forestDiff >= 0 ? '+' : '')}{metrics?.forestDiff.toFixed(1)}%
                  </td>
                </tr>
                <tr>
                  <td className="text-left py-2 font-medium text-gray-700">Agricultural Area</td>
                  {trendData.agricultural_pct.map((pct, i) => <td key={i} className="py-2 text-gray-600">{pct}%</td>)}
                  <td className={`py-2 font-bold ${metrics?.agriDiff && metrics.agriDiff >= 0 ? 'text-tertiary-600' : 'text-accent-600'}`}>
                    {metrics && (metrics.agriDiff >= 0 ? '+' : '')}{metrics?.agriDiff.toFixed(1)}%
                  </td>
                </tr>
                <tr>
                  <td className="text-left py-2 font-medium text-gray-700">Surface Water Bodies</td>
                  {trendData.water_bodies_pct.map((pct, i) => <td key={i} className="py-2 text-gray-600">{pct}%</td>)}
                  <td className={`py-2 font-bold ${metrics?.waterDiff && metrics.waterDiff >= 0 ? 'text-tertiary-600' : 'text-accent-600'}`}>
                    {metrics && (metrics.waterDiff >= 0 ? '+' : '')}{metrics?.waterDiff.toFixed(1)}%
                  </td>
                </tr>
                <tr>
                  <td className="text-left py-2 font-medium text-gray-700">Barren / Degraded Ground</td>
                  {trendData.barren_degraded_pct.map((pct, i) => <td key={i} className="py-2 text-gray-600">{pct}%</td>)}
                  <td className={`py-2 font-bold ${metrics?.barrenDiff && metrics.barrenDiff <= 0 ? 'text-tertiary-600' : 'text-accent-600'}`}>
                    {metrics && (metrics.barrenDiff >= 0 ? '+' : '')}{metrics?.barrenDiff.toFixed(1)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Live Earth Engine Result ──────────────────────────────────────── */}
      {liveLoading && (
        <div className="bg-white rounded-lg border border-emerald-200 shadow-sm p-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-emerald-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Running live Earth Engine classification…</p>
            <p className="text-xs text-gray-500 mt-0.5">This typically takes 5–15 seconds. Landsat 8+9 median composite → NDVI/NDWI → 4-class LULC.</p>
          </div>
        </div>
      )}

      {liveError && (
        <div className="bg-red-50 rounded-lg border border-red-200 shadow-sm p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Live computation failed</p>
            <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{liveError}</p>
          </div>
        </div>
      )}

      {liveResult && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Satellite className="w-5 h-5 text-emerald-600" />
              <div>
                <h2 className="text-base font-bold text-text-dark">Live Earth Engine Calculation</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Landsat 8+9 • NDVI/NDWI classification • Scale 30m •{' '}
                  <time dateTime={liveResult.computed_at}>
                    {new Date(liveResult.computed_at).toLocaleString()}
                  </time>
                </p>
              </div>
            </div>
            <span className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider">
              Live Satellite
            </span>
          </div>
          <p className="text-[11px] text-emerald-700 -mt-2">
            Google Earth Engine / Landsat 8/9 / 30m resolution — computed on demand, not prototype data.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Forest */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Forest</span>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">{liveResult.forest_pct}%</p>
            </div>
            {/* Agricultural */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Agricultural</span>
              <p className="text-lg font-bold text-amber-700 mt-0.5">{liveResult.agricultural_pct}%</p>
            </div>
            {/* Water Bodies */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Water Bodies</span>
              <p className="text-lg font-bold text-blue-700 mt-0.5">{liveResult.water_bodies_pct}%</p>
            </div>
            {/* Barren / Degraded */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Barren / Degraded</span>
              <p className="text-lg font-bold text-gray-600 mt-0.5">{liveResult.barren_degraded_pct}%</p>
            </div>
          </div>

          {/* Moisture proxy — deliberately separated from the 4 classification
              cards above, since this is NOT the same kind of measurement and
              should never be visually implied as equivalent. */}
          {liveResult.moisture_proxy_ndwi !== null && (
            <div className="mt-3 bg-cyan-50 border border-cyan-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-cyan-800 font-semibold uppercase tracking-wider">Moisture / Wetness Proxy (NDWI)</span>
                <span className="text-sm font-bold text-cyan-800">{liveResult.moisture_proxy_ndwi} — {liveResult.moisture_proxy_category}</span>
              </div>
              <p className="text-[11px] text-cyan-700 mt-1">{liveResult.moisture_proxy_disclaimer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SpatialAnalysis;