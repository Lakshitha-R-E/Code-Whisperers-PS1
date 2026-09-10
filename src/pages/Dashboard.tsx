import React, { useEffect, useState, useMemo } from 'react';
import {
  Layers, CheckCircle, AlertTriangle, Star, Activity, ShieldCheck,
} from 'lucide-react';
import StatCard from '../components/StatCard';
import AlertsList from '../components/AlertsList';
import StatusChart from '../components/StatusChart';
import { getProjects } from '../services/projectService';
import { getWatersheds } from '../services/watershedService';
import { getAlerts } from '../services/alertService';
import { getGeoEvidence, computeAverageTrustScore } from '../services/evidenceService';
import { useAuthStore } from '../store/authStore';
import type { Project, MaintenanceAlert, GeoEvidence, WatershedFeature } from '../types';

const Dashboard: React.FC = () => {
  const officer = useAuthStore(s => s.officer);
  const [projects, setProjects]   = useState<Project[]>([]);
  const [watersheds, setWatersheds] = useState<WatershedFeature[]>([]);
  const [alerts, setAlerts]       = useState<MaintenanceAlert[]>([]);
  const [evidence, setEvidence]   = useState<GeoEvidence[]>([]);

  useEffect(() => {
    Promise.all([
      getProjects(),
      getWatersheds(),
      getAlerts(),
      getGeoEvidence(),
    ]).then(([allProjects, allWatersheds, allAlerts, allEvidence]) => {
      // District-scoped access: officers see only their assigned district.
      // The admin account (district === '') sees everything, unscoped.
      const scoped = officer && !officer.isAdmin
        ? allProjects.filter(p => p.district === officer.district)
        : allProjects;
      const scopedIds = new Set(scoped.map(p => p.id));

      setProjects(scoped);
      setWatersheds(
        officer && !officer.isAdmin
          ? allWatersheds.filter(w => w.properties.district === officer.district)
          : allWatersheds
      );
      setAlerts(allAlerts.filter(a => scopedIds.has(a.project_id)));
      setEvidence(allEvidence.filter(e => scopedIds.has(e.project_id)));
    });
  }, [officer]);

  const stats = useMemo(() => {
    const completed = projects.filter(p => p.status === 'Completed').length;
    const pct = projects.length ? Math.round((completed / projects.length) * 100) : 0;
    const avgTrust = computeAverageTrustScore(evidence);
    const spatiallyVerified = evidence.filter(e => e.gps_check === 'pass').length;
    const spvPct = evidence.length ? Math.round((spatiallyVerified / evidence.length) * 100) : 0;
    return { completed, pct, avgTrust, spvPct };
  }, [projects, evidence]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-bold text-text-dark">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Watershed Development Monitoring — SIH26015 &nbsp;|&nbsp; Ministry of Rural Development / Dept. of Land Resources
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Interventions"
          value={projects.length}
          icon={Layers}
          iconBg="bg-primary-100"
          sub={`Across ${watersheds.length} watersheds`}
        />
        <StatCard
          label="% Completed"
          value={`${stats.pct}%`}
          icon={CheckCircle}
          iconBg="bg-tertiary-100"
          sub={`${stats.completed} of ${projects.length}`}
        />
        <StatCard
          label="Watersheds Monitored"
          value={watersheds.length}
          icon={Activity}
          iconBg="bg-secondary-100"
          sub="Districts covered"
        />
        <StatCard
          label="Active Alerts"
          value={alerts.length}
          icon={AlertTriangle}
          iconBg="bg-accent-100"
          sub="Maintenance flags"
        />
        <StatCard
          label="Avg Trust Score"
          value={`${stats.avgTrust}/5`}
          icon={Star}
          iconBg="bg-primary-50"
          sub={`${stats.spvPct}% spatially verified`}
        />
      </div>

      {/* Quick metrics strip */}
      <div className="bg-primary-700 text-white rounded-lg px-5 py-3 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary-200" />
          <span className="text-primary-200">Spatially Verified:</span>
          <span className="font-bold">{stats.spvPct}% of evidence</span>
        </div>
        <div className="text-primary-400 hidden sm:block">|</div>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary-200" />
          <span className="text-primary-200">Delayed Interventions:</span>
          <span className="font-bold">{projects.filter(p => p.status === 'Delayed').length}</span>
        </div>
        <div className="text-primary-400 hidden sm:block">|</div>
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary-200" />
          <span className="text-primary-200">States Covered:</span>
          <span className="font-bold">
            {[...new Set(watersheds.map(w => w.properties.state))].join(', ')}
          </span>
        </div>
      </div>

      {/* Status charts + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Charts */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-text-dark mb-3">Intervention Breakdown</h2>
          <StatusChart projects={projects} />
        </div>

        {/* Alerts panel */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-dark">Maintenance Alerts</h2>
            <span className="text-xs text-accent-600 font-semibold">{alerts.length} active</span>
          </div>
          <AlertsList alerts={alerts} limit={5} />
        </div>
      </div>

      {/* Watershed summary table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-text-dark mb-3">Watershed Overview</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left pb-2 pr-4 font-medium">Watershed</th>
                <th className="text-left pb-2 pr-4 font-medium">District, State</th>
                <th className="text-right pb-2 pr-4 font-medium">Interventions</th>
                <th className="text-right pb-2 pr-4 font-medium">Completed</th>
                <th className="text-right pb-2 pr-4 font-medium">Delayed</th>
                <th className="text-right pb-2 font-medium">Area (km²)</th>
              </tr>
            </thead>
            <tbody>
              {watersheds.map(ws => {
                const wsProjects = projects.filter(p => p.watershed_id === ws.properties.id);
                const done    = wsProjects.filter(p => p.status === 'Completed').length;
                const delayed = wsProjects.filter(p => p.status === 'Delayed').length;
                return (
                  <tr key={ws.properties.id} className="border-b border-gray-100 hover:bg-surface-card">
                    <td className="py-2 pr-4 font-medium text-primary-700">{ws.properties.name}</td>
                    <td className="py-2 pr-4 text-gray-500">{ws.properties.district}, {ws.properties.state}</td>
                    <td className="py-2 pr-4 text-right">{wsProjects.length}</td>
                    <td className="py-2 pr-4 text-right text-tertiary-600 font-medium">{done}</td>
                    <td className="py-2 pr-4 text-right">
                      {delayed > 0
                        ? <span className="text-accent-600 font-medium">{delayed}</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="py-2 text-right text-gray-500">{ws.properties.area_sq_km.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
