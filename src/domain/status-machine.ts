import { OrderStatus, PrincipalType, Permission, StaffRole, Order } from './types';

export const ALL_PERMISSIONS: Permission[] = [
  'orders.view',
  'orders.assign',
  'orders.status.update',
  'orders.cancel',
  'quality.perform',
  'issues.manage',
  'orders.return.confirm',
  'employees.view',
  'employees.manage',
  'team.manage',
  'parking.manage',
  'qr.manage',
  'services.manage',
  'pricing.manage',
  'subscriptions.manage',
  'credits.adjust',
  'reports.view',
  'audit.view',
  'settings.manage',
  'staff.manage',
];

export const ROLE_DEFAULT_PERMISSIONS: Record<StaffRole, Permission[]> = {
  SUPERADMIN: ALL_PERMISSIONS,
  SUPERVISOR: [
    'orders.view',
    'orders.status.update',
    'orders.assign',
    'quality.perform',
    'issues.manage',
    'orders.return.confirm',
    'employees.view',
    'reports.view',
  ],
};

export interface ActorContext {
  type: PrincipalType;
  id: string;
  name?: string;
  email?: string;
  role?: StaffRole;
  permissionOverrides?: Permission[];
}

export function hasPermission(actor: ActorContext, permission: Permission): boolean {
  if (actor.type === 'EMPLOYEE') {
    return false; // Employees do not hold staff operational permissions
  }
  if (actor.role === 'SUPERADMIN') {
    return true;
  }
  const base = actor.role ? ROLE_DEFAULT_PERMISSIONS[actor.role] : [];
  const overrides = actor.permissionOverrides || [];
  return base.includes(permission) || overrides.includes(permission);
}

export interface TransitionRule {
  from: OrderStatus | 'INITIAL';
  to: OrderStatus;
  permission?: Permission;
  allowedActors: PrincipalType[];
  validate?: (order: Order, payload: Record<string, unknown>) => { valid: boolean; error?: string };
}

export const TRANSITION_RULES: TransitionRule[] = [
  {
    from: 'INITIAL',
    to: 'NEW',
    allowedActors: ['EMPLOYEE', 'STAFF'],
  },
  {
    from: 'NEW',
    to: 'ASSIGNED',
    permission: 'orders.assign',
    allowedActors: ['STAFF'],
  },
  {
    from: 'NEW',
    to: 'IN_PROGRESS',
    permission: 'orders.status.update',
    allowedActors: ['STAFF'],
  },
  {
    from: 'NEW',
    to: 'RETURNED_TO_PARKING',
    permission: 'orders.return.confirm',
    allowedActors: ['STAFF'],
  },
  {
    from: 'ASSIGNED',
    to: 'NEW',
    permission: 'orders.status.update',
    allowedActors: ['STAFF'],
  },
  {
    from: 'ASSIGNED',
    to: 'ASSIGNED', // Reassign
    permission: 'orders.assign',
    allowedActors: ['STAFF'],
  },
  {
    from: 'ASSIGNED',
    to: 'IN_PROGRESS',
    permission: 'orders.status.update',
    allowedActors: ['STAFF'],
  },
  {
    from: 'ASSIGNED',
    to: 'RETURNED_TO_PARKING',
    permission: 'orders.return.confirm',
    allowedActors: ['STAFF'],
  },
  {
    from: 'IN_PROGRESS',
    to: 'ASSIGNED',
    permission: 'orders.status.update',
    allowedActors: ['STAFF'],
  },
  {
    from: 'IN_PROGRESS',
    to: 'NEW',
    permission: 'orders.status.update',
    allowedActors: ['STAFF'],
  },
  {
    from: 'IN_PROGRESS',
    to: 'QUALITY_CHECK',
    permission: 'orders.status.update',
    allowedActors: ['STAFF'],
  },
  {
    from: 'IN_PROGRESS',
    to: 'RETURNED_TO_PARKING',
    permission: 'orders.return.confirm',
    allowedActors: ['STAFF'],
  },
  {
    from: 'IN_PROGRESS',
    to: 'COMPLETED',
    permission: 'orders.return.confirm',
    allowedActors: ['STAFF'],
  },
  {
    from: 'QUALITY_CHECK',
    to: 'COMPLETED',
    permission: 'quality.perform',
    allowedActors: ['STAFF'],
  },
  {
    from: 'QUALITY_CHECK',
    to: 'RETURNED_TO_PARKING',
    permission: 'orders.return.confirm',
    allowedActors: ['STAFF'],
  },
  {
    from: 'QUALITY_CHECK',
    to: 'IN_PROGRESS', // Rework needed
    permission: 'quality.perform',
    allowedActors: ['STAFF'],
  },
  {
    from: 'COMPLETED',
    to: 'RETURNED_TO_PARKING',
    permission: 'orders.return.confirm',
    allowedActors: ['STAFF'],
  },
  {
    from: 'RETURNED_TO_PARKING',
    to: 'IN_PROGRESS', // Re-detail
    permission: 'orders.status.update',
    allowedActors: ['STAFF'],
  },
  {
    from: 'NEW',
    to: 'CANCELLED',
    allowedActors: ['EMPLOYEE', 'STAFF'],
  },
  {
    from: 'ASSIGNED',
    to: 'CANCELLED',
    permission: 'orders.cancel',
    allowedActors: ['STAFF'],
  },
  {
    from: 'IN_PROGRESS',
    to: 'CANCELLED',
    permission: 'orders.cancel',
    allowedActors: ['STAFF'],
  },
  {
    from: 'RETURNED_TO_PARKING',
    to: 'CANCELLED',
    permission: 'orders.cancel',
    allowedActors: ['STAFF'],
  },
  // Issue reporting from active operational states
  {
    from: 'NEW',
    to: 'ISSUE_REPORTED',
    permission: 'issues.manage',
    allowedActors: ['STAFF'],
  },
  {
    from: 'ASSIGNED',
    to: 'ISSUE_REPORTED',
    permission: 'issues.manage',
    allowedActors: ['STAFF'],
  },
  {
    from: 'IN_PROGRESS',
    to: 'ISSUE_REPORTED',
    permission: 'issues.manage',
    allowedActors: ['STAFF'],
  },
  {
    from: 'QUALITY_CHECK',
    to: 'ISSUE_REPORTED',
    permission: 'issues.manage',
    allowedActors: ['STAFF'],
  },
  {
    from: 'COMPLETED',
    to: 'ISSUE_REPORTED',
    permission: 'issues.manage',
    allowedActors: ['STAFF'],
  },
  {
    from: 'ISSUE_REPORTED',
    to: 'CANCELLED',
    permission: 'orders.cancel',
    allowedActors: ['STAFF'],
  },
];

export function getAllowedTransitions(order: Order, actor: ActorContext): OrderStatus[] {
  const allowed = new Set<OrderStatus>();

  for (const rule of TRANSITION_RULES) {
    if (rule.from === order.status) {
      if (!rule.allowedActors.includes(actor.type)) {
        continue;
      }
      if (rule.permission && !hasPermission(actor, rule.permission)) {
        continue;
      }
      // If employee, can only cancel their own order while status is NEW
      if (actor.type === 'EMPLOYEE') {
        if (rule.to === 'CANCELLED' && (order.employeeId !== actor.id || order.status !== 'NEW')) {
          continue;
        }
      }
      allowed.add(rule.to);
    }
  }

  // If issue is reported, allow resuming to previous state
  if (order.status === 'ISSUE_REPORTED' && order.statusBeforeIssue) {
    if (actor.type === 'STAFF' && hasPermission(actor, 'issues.manage')) {
      allowed.add(order.statusBeforeIssue);
    }
  }

  return Array.from(allowed);
}

export const STATUS_META: Record<
  OrderStatus,
  { label: string; customerLabel: string; description: string; badgeVariant: string }
> = {
  NEW: {
    label: 'New Order',
    customerLabel: 'Order Received',
    description: 'Order placed and logged in operational queue',
    badgeVariant: 'neutral',
  },
  ASSIGNED: {
    label: 'Assigned',
    customerLabel: 'Team Allocated',
    description: 'Field team or specialist allocated to the vehicle',
    badgeVariant: 'info',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    customerLabel: 'Vehicle Being Cleaned',
    description: 'Physical detailing and wash underway',
    badgeVariant: 'warning',
  },
  QUALITY_CHECK: {
    label: 'Quality Check',
    customerLabel: 'Under Inspection',
    description: 'Supervisor/Lead reviewing cleanliness and finishes',
    badgeVariant: 'purple',
  },
  COMPLETED: {
    label: 'Clean Completed',
    customerLabel: 'Detailing Finished',
    description: 'Wash passed QC; awaiting return confirmation',
    badgeVariant: 'teal',
  },
  RETURNED_TO_PARKING: {
    label: 'Returned to Bay',
    customerLabel: 'Ready in Parking Bay',
    description: 'Vehicle verified physically parked at original bay',
    badgeVariant: 'success',
  },
  ISSUE_REPORTED: {
    label: 'Issue Reported',
    customerLabel: 'Service Update',
    description: 'Special attention or access required',
    badgeVariant: 'danger',
  },
  CANCELLED: {
    label: 'Cancelled',
    customerLabel: 'Order Cancelled',
    description: 'Order terminated and credit status updated',
    badgeVariant: 'muted',
  },
};
