import React from 'react';
import { Card, CardHeader, CardBody } from '../../../shared/ui';

export const SectionCard = ({ title, subtitle, action, icon, children, className = '' }) => {
  return (
    <Card className={className}>
      {(title || subtitle || action) && (
        <CardHeader title={title} subtitle={subtitle} action={action} icon={icon} />
      )}
      <CardBody>{children}</CardBody>
    </Card>
  );
};

export default SectionCard;
