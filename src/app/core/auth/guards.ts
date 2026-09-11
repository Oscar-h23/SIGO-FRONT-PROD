import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ModuloSigo, RolSistema } from './auth.models';

export const authGuard:CanActivateFn=()=>{
  const a=inject(AuthService), r=inject(Router);
  return a.estaLogueado()?true:r.createUrlTree(['/login']);
};
export const passwordChangedGuard:CanActivateFn=()=>{
  const a=inject(AuthService), r=inject(Router);
  return a.requiereCambio()?r.createUrlTree(['/cambiar-password']):true;
};
export const moduleGuard=(m:ModuloSigo):CanActivateFn=>()=>{
  const a=inject(AuthService),r=inject(Router);
  return a.tieneModulo(m)?true:r.createUrlTree(['/forbidden']);
};
export const roleGuard=(...roles:RolSistema[]):CanActivateFn=>()=>{
  const a=inject(AuthService),r=inject(Router);
  return a.tieneRol(...roles)?true:r.createUrlTree(['/forbidden']);
};
