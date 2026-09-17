import React from 'react';
import { Badge } from '../../../shared/ui';

export const StatusBadge = ({ status, size = 'md' }) => {
  return <Badge status={status} size={size} />;
};

export default StatusBadge;
