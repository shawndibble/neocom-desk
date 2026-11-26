import { Navigate, useLocation } from 'react-router-dom';

export function SkillsIndexRedirect() {
  const { search, hash, state } = useLocation();
  return <Navigate replace to={{ pathname: '/skills/plans', search, hash }} state={state} />;
}
