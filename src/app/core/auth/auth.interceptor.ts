import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor:HttpInterceptorFn=(req,next)=>{
  const auth=inject(AuthService);
  const router=inject(Router);
  const token=auth.token();
  const outgoing=token?req.clone({setHeaders:{Authorization:`Bearer ${token}`}}):req;
  return next(outgoing).pipe(catchError(err=>{
    if(err.status===401 && !req.url.includes('/api/auth/login')){
      auth.logout(); router.navigateByUrl('/login');
    }
    if(err.status===403) router.navigateByUrl('/forbidden');
    return throwError(()=>err);
  }));
};
