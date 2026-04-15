'use client';

import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import { heartbeatClient } from '@/lib/api-client/heartbeat.client';
import { usersClient } from '@/lib/api-client/users.client';
import type { Blueprint, UserListItemDto } from '@vantrade/types';
import { type Role } from '@vantrade/types';
import { useEffect, useState } from 'react';

export function useAdmin() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [users, setUsers] = useState<UserListItemDto[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [lastTriggeredAt, setLastTriggeredAt] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [bps, us] = await Promise.all([blueprintsClient.getAllAdmin(), usersClient.listUsers()]);
        setBlueprints(bps);
        setUsers(us);
      } catch {
        setError('Failed to load admin data');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleVerify(id: string, verified: boolean) {
    try {
      const updated = await blueprintsClient.verify(id, verified);
      setBlueprints((prev) => prev.map((bp) => (bp.id === id ? { ...bp, isVerified: updated.isVerified } : bp)));
    } catch {
      setError('Failed to update verification status');
    }
  }

  async function handleAssignRole(id: string) {
    const role = pendingRoles[id];
    if (!role) return;
    try {
      const updated = await usersClient.assignRole(id, role);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: updated.role } : u)));
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      setError('Failed to assign role');
    }
  }

  async function handleTriggerHeartbeat() {
    setTriggering(true);
    setError('');
    try {
      const result = await heartbeatClient.trigger();
      setLastTriggeredAt(result.triggeredAt);
    } catch {
      setError('Failed to trigger heartbeat');
    } finally {
      setTriggering(false);
    }
  }

  return { blueprints, users, pendingRoles, setPendingRoles, loading, error, handleVerify, handleAssignRole, triggering, lastTriggeredAt, handleTriggerHeartbeat };
}
