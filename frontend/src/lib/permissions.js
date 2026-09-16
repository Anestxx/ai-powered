export const canManageVehicles = session => ['admin', 'transport_department'].includes(session?.role);
export const canViewFleet = session => ['admin', 'transport_department', 'municipality', 'traffic_police'].includes(session?.role);
export const canReviewEvents = session => ['admin', 'municipality'].includes(session?.role);
export const canViewEvidence = session => ['admin', 'municipality', 'traffic_police'].includes(session?.role);
