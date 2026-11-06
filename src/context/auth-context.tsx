'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ActorContext } from '@/domain/status-machine';
import { mockStore } from '@/data/mock/store';

interface AuthContextType {
  actor: ActorContext;
  setActor: (actor: ActorContext) => void;
  availableEmployees: Array<{ id: string; name: string; email: string; company?: string }>;
  availableStaff: Array<{ id: string; name: string; email: string; role: 'SUPERADMIN' | 'SUPERVISOR' }>;
}

// Nobody is signed in until the server confirms a sign in
const defaultEmployeeActor: ActorContext = {
  type: 'EMPLOYEE',
  id: '',
  name: '',
  email: '',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [actor, setActor] = useState<ActorContext>(defaultEmployeeActor);
  const [employees, setEmployees] = useState<AuthContextType['availableEmployees']>([]);
  const [staff, setStaff] = useState<AuthContextType['availableStaff']>([]);

  useEffect(() => {
    const db = mockStore.getDb();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration sync from store
    setEmployees(db.employees.map((e) => ({ id: e.id, name: e.fullName, email: e.email, company: e.company })));
    setStaff(db.staff.map((s) => ({ id: s.id, name: s.fullName, email: s.email, role: s.role })));

    // Load saved actor if any
    try {
      const saved = localStorage.getItem('cb_active_actor');
      if (saved) {
        setActor(JSON.parse(saved));
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleSetActor = (newActor: ActorContext) => {
    setActor(newActor);
    try {
      localStorage.setItem('cb_active_actor', JSON.stringify(newActor));
    } catch {
      // Ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        actor,
        setActor: handleSetActor,
        availableEmployees: employees,
        availableStaff: staff,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
