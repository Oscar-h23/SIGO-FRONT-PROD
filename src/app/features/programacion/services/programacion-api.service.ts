import{HttpClient,HttpParams}from'@angular/common/http';
import{inject,Injectable}from'@angular/core';
import{Observable}from'rxjs';
import{environment}from'../../../../environments/environment';
import{
 CoberturaUbicacion,DistribucionDia,GrupoLider,GrupoLiderRequest,GuardarDistribucionRequest,
 GuardarProgramacionRequest,MiHorario,Plaza,ProgramacionDia,ResumenTrabajador,TrabajadorResumen,Ubicacion
}from'../models/programacion.models';

@Injectable({providedIn:'root'})
export class ProgramacionApiService{
 private readonly http=inject(HttpClient);
 private readonly api=environment.apiUrl;

 getPlazas():Observable<Plaza[]>{return this.http.get<Plaza[]>(`${this.api}/plazas`);}
 getAgentes(plazaId:number):Observable<TrabajadorResumen[]>{
   return this.http.get<TrabajadorResumen[]>(`${this.api}/trabajadores/agentes`,{params:new HttpParams().set('plazaId',plazaId)});
 }
 getControladores(plazaId:number):Observable<TrabajadorResumen[]>{
   return this.http.get<TrabajadorResumen[]>(`${this.api}/trabajadores/controladores`,{params:new HttpParams().set('plazaId',plazaId)});
 }
 getTurnos(plazaId:number,anio:number,mes:number):Observable<ProgramacionDia[]>{
   const params=new HttpParams().set('plazaId',plazaId).set('anio',anio).set('mes',mes);
   return this.http.get<ProgramacionDia[]>(`${this.api}/programacion/turnos`,{params});
 }
 guardarTurnos(request:GuardarProgramacionRequest):Observable<ProgramacionDia[]>{
   return this.http.put<ProgramacionDia[]>(`${this.api}/programacion/turnos`,request);
 }
 getUbicaciones(plazaId:number):Observable<Ubicacion[]>{
   return this.http.get<Ubicacion[]>(`${this.api}/distribucion/ubicaciones`,{params:new HttpParams().set('plazaId',plazaId)});
 }
 getDistribucion(plazaId:number,anio:number,mes:number):Observable<DistribucionDia[]>{
   const params=new HttpParams().set('plazaId',plazaId).set('anio',anio).set('mes',mes);
   return this.http.get<DistribucionDia[]>(`${this.api}/distribucion`,{params});
 }
 guardarDistribucion(request:GuardarDistribucionRequest):Observable<DistribucionDia[]>{
   return this.http.put<DistribucionDia[]>(`${this.api}/distribucion`,request);
 }
 getCobertura(plazaId:number,anio:number,mes:number):Observable<CoberturaUbicacion[]>{
   const params=new HttpParams().set('plazaId',plazaId).set('anio',anio).set('mes',mes);
   return this.http.get<CoberturaUbicacion[]>(`${this.api}/distribucion/cobertura`,{params});
 }
 getResumenTrabajador(trabajadorId:number,anio:number,mes:number):Observable<ResumenTrabajador>{
   const params=new HttpParams().set('anio',anio).set('mes',mes);
   return this.http.get<ResumenTrabajador>(`${this.api}/distribucion/resumen-trabajador/${trabajadorId}`,{params});
 }
 getMiHorario(desde:string,hasta:string):Observable<MiHorario>{
   const params=new HttpParams().set('desde',desde).set('hasta',hasta);
   return this.http.get<MiHorario>(`${this.api}/programacion/mi-horario`,{params});
 }
 getGrupos(plazaId:number):Observable<GrupoLider[]>{
   return this.http.get<GrupoLider[]>(`${this.api}/programacion/grupos`,{params:new HttpParams().set('plazaId',plazaId)});
 }
 asignarLider(request:GrupoLiderRequest):Observable<GrupoLider>{
   return this.http.put<GrupoLider>(`${this.api}/programacion/grupos/lider`,request);
 }
}
