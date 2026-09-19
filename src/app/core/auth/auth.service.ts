import{Injectable,signal}from'@angular/core';
import{HttpClient}from'@angular/common/http';
import{firstValueFrom}from'rxjs';
import{environment}from'../../../environments/environment';
import{LoginResponse,ModuloSigo,RolSistema,UsuarioSesion}from'./auth.models';

@Injectable({providedIn:'root'})
export class AuthService{
 private readonly tokenKey='sigo_token';
 private readonly userKey='sigo_usuario';
 readonly usuario=signal<UsuarioSesion|null>(this.readUser());

 constructor(private http:HttpClient){}

 async login(codigo:number,password:string):Promise<LoginResponse>{
   const r=await firstValueFrom(this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`,{codigo,password}));
   localStorage.setItem(this.tokenKey,r.token);
   const u=this.normalizarUsuario({...r.usuario,requiereCambioPassword:r.requiereCambioPassword??r.usuario.requiereCambioPassword??false});
   localStorage.setItem(this.userKey,JSON.stringify(u));this.usuario.set(u);
   return{...r,usuario:u};
 }

 async restore():Promise<UsuarioSesion|null>{
   if(!this.token())return null;
   try{
     const u=await firstValueFrom(this.http.get<UsuarioSesion>(`${environment.apiUrl}/auth/me`));
     const prev=this.usuario();
     const merged=this.normalizarUsuario({...u,requiereCambioPassword:u.requiereCambioPassword??prev?.requiereCambioPassword??false});
     localStorage.setItem(this.userKey,JSON.stringify(merged));this.usuario.set(merged);return merged;
   }catch{this.logout();return null;}
 }

 async cambiarPassword(passwordActual:string,passwordNueva:string):Promise<void>{
   await firstValueFrom(this.http.put<void>(`${environment.apiUrl}/auth/change-password`,{passwordActual,passwordNueva}));
   const u=this.usuario();
   if(u){const next={...u,requiereCambioPassword:false};localStorage.setItem(this.userKey,JSON.stringify(next));this.usuario.set(next);}
 }

 logout():void{localStorage.removeItem(this.tokenKey);localStorage.removeItem(this.userKey);this.usuario.set(null);}
 token():string|null{return localStorage.getItem(this.tokenKey);}
 estaLogueado():boolean{return!!this.token();}
 tieneRol(...roles:(RolSistema|string)[]):boolean{return!!this.usuario()?.rol&&roles.includes(this.usuario()!.rol);}
 tieneModulo(modulo:ModuloSigo):boolean{return this.usuario()?.modulos?.includes(modulo)??false;}
 requiereCambio():boolean{return this.usuario()?.requiereCambioPassword===true;}

 private readUser():UsuarioSesion|null{
   try{const raw=localStorage.getItem(this.userKey);return raw?this.normalizarUsuario(JSON.parse(raw)as UsuarioSesion):null;}
   catch{return null;}
 }

 private normalizarUsuario(usuario:UsuarioSesion):UsuarioSesion{
   const servidor=Array.isArray(usuario.modulos)?usuario.modulos:[];
   const minimos:Record<RolSistema,ModuloSigo[]>={
     SUPERVISOR:['DASHBOARD','RELEVOS','ASISTENCIA','INVENTARIO','ADMIN_PRODUCTOS','TRABAJADORES','CHAT','PROGRAMACION','DISTRIBUCION','MI_HORARIO'],
     CONTROLADOR:['DASHBOARD','RELEVOS','ASISTENCIA','INVENTARIO','ADMIN_PRODUCTOS','CHAT','DISTRIBUCION','MI_HORARIO'],
     OPERADOR:['RELEVOS','INVENTARIO','MI_HORARIO']
   };
   return{...usuario,trabajadorId:usuario.trabajadorId??usuario.id,modulos:[...new Set<ModuloSigo>([...servidor,...minimos[usuario.rol]])]};
 }
}
