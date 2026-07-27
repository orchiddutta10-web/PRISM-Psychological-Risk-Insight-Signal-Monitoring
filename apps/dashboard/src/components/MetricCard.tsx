import React from 'react';
import styles from './MetricCard.module.css';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';

type Status = 'good' | 'warning' | 'critical';

interface MetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  icon: React.ReactElement;
  status: Status;
  progress?: number; // 0-100
  lastUpdated: string; // formatted string
}

const statusColors: Record<Status, { badge: string; bg: string }> = {
  good: { badge: '#28a745', bg: '#e6f4ea' }, // green
  warning: { badge: '#ff9800', bg: '#fff4e5' }, // orange
  critical: { badge: '#dc2626', bg: '#fde8e8' }, // red
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit = '',
  icon,
  status,
  progress = 0,
  lastUpdated,
}) => {
  const { badge, bg } = statusColors[status];

  return (
    <div className={styles.card} style={{ borderColor: badge }}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>{React.cloneElement(icon, { size: 16, color: badge })}</div>
        <span className={styles.title}>{title}</span>
        <div className={styles.statusBadge} style={{ backgroundColor: badge }}>
          {status === 'good' && <CheckCircle size={10} />}
          {status === 'warning' && <AlertTriangle size={10} />}
          {status === 'critical' && <Info size={10} />}
        </div>
      </div>
      <div className={styles.value}>
        {value}
        {unit && <span className={styles.unit}> {unit}</span>}
      </div>
      <div className={styles.progressContainer}>
        <div
          className={styles.progressBar}
          style={{ width: `${progress}%`, backgroundColor: badge }}
        ></div>
      </div>
      <div className={styles.footer}>Last updated: {lastUpdated}</div>
    </div>
  );
};

export default MetricCard;
