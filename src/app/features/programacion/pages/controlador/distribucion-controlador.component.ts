import{CommonModule}from'@angular/common';
import{Component,OnInit,inject}from'@angular/core';
import{FormsModule}from'@angular/forms';
import{finalize,forkJoin}from'rxjs';
import{AuthService}from'../../../../core/auth/auth.service';
import{CoberturaUbicacion,EstadoProgramacion,Plaza,ProgramacionDia,ResumenTrabajador,TrabajadorResumen,Ubicacion}from'../../models/programacion.models';
import{ProgramacionApiService}from'../../services/programacion-api.service';

@Component({
 selector:'app-distribucion-controlador',
 standalone:true,
 imports:[CommonModule,FormsModule],
 templateUrl:'./distribucion-controlador.component.html',
 styleUrl:'./distribucion-controlador.component.css'
})
export class DistribucionControladorComponent implements OnInit{
 private readonly api=inject(ProgramacionApiService);
 readonly auth=inject(AuthService);

 plazas:Plaza[]=[];
 plazaId:number|null=null;
 anio=new Date().getFullYear();
 mes=new Date().getMonth()+1;
 dias:number[]=[];
 agentes:TrabajadorResumen[]=[];
 ubicaciones:Ubicacion[]=[];
 programaciones:ProgramacionDia[]=[];
 cobertura:CoberturaUbicacion[]=[];
 resumen:ResumenTrabajador|null=null;
 seleccionado:number|null=null;
 busqueda='';
 cargando=false;
 guardando=false;
 error='';
 mensaje='';
 readonly asignaciones=new Map<number,number>();
 readonly cambios=new Map<number,number>();

 get esSupervisor():boolean{return this.auth.tieneRol('SUPERVISOR');}
 get mesInput():string{return `${this.anio}-${String(this.mes).padStart(2,'0')}`;}

 ngOnInit():void{
   if(this.esSupervisor){
     this.api.getPlazas().subscribe({
       next:p=>{this.plazas=p;this.plazaId=p.find(x=>x.codigo==='P4')?.id??p[0]?.id??null;if(this.plazaId)this.cargar();},
       error:e=>this.error=this.mensajeError(e,'No se pudieron cargar las plazas.')
     });
   }else{
     this.plazaId=this.auth.usuario()?.plazaId??null;
     if(this.plazaId)this.cargar();else this.error='Tu usuario no tiene una plaza asignada.';
   }
 }

 cambiarMes(value:string):void{
   if(!value)return;
   const[a,m]=value.split('-').map(Number);this.anio=a;this.mes=m;this.cargar();
 }

 get agentesFiltrados():TrabajadorResumen[]{
   const q=this.busqueda.trim().toLowerCase();
   return q?this.agentes.filter(a=>`${a.codigo} ${a.nombreCompleto}`.toLowerCase().includes(q)):this.agentes;
 }

 cargar():void{
   if(!this.plazaId)return;
   this.cargando=true;this.error='';this.mensaje='';
   this.dias=Array.from({length:new Date(this.anio,this.mes,0).getDate()},(_,i)=>i+1);
   forkJoin({
     agentes:this.api.getAgentes(this.plazaId),
     turnos:this.api.getTurnos(this.plazaId,this.anio,this.mes),
     ubicaciones:this.api.getUbicaciones(this.plazaId),
     distribucion:this.api.getDistribucion(this.plazaId,this.anio,this.mes),
     cobertura:this.api.getCobertura(this.plazaId,this.anio,this.mes)
   }).pipe(finalize(()=>this.cargando=false)).subscribe({
     next:r=>{
       this.agentes=r.agentes;this.programaciones=r.turnos;this.ubicaciones=r.ubicaciones;this.cobertura=r.cobertura;
       this.asignaciones.clear();this.cambios.clear();
       for(const d of r.distribucion)this.asignaciones.set(d.programacionTurnoId,d.ubicacionId);
       if(!this.seleccionado&&this.agentes.length)this.seleccionar(this.agentes[0].id);
     },
     error:e=>this.error=this.mensajeError(e,'No se pudo cargar la distribución.')
   });
 }

 programacion(agenteId:number,dia:number):ProgramacionDia|null{
   const f=this.fecha(dia);
   return this.programaciones.find(p=>p.trabajadorId===agenteId&&p.fecha===f)??null;
 }

 asignacion(programacionId:number):number|null{return this.asignaciones.get(programacionId)??null;}

 cambiar(programacionId:number,ubicacionId:number|null):void{
   if(ubicacionId===null||ubicacionId===undefined)return;
   this.asignaciones.set(programacionId,+ubicacionId);
   this.cambios.set(programacionId,+ubicacionId);
 }

 guardar():void{
   if(!this.plazaId||!this.cambios.size)return;
   const distribuciones=[...this.cambios.entries()].map(([programacionTurnoId,ubicacionId])=>({programacionTurnoId,ubicacionId,observacion:null}));
   this.guardando=true;this.error='';this.mensaje='';
   this.api.guardarDistribucion({plazaId:this.plazaId,distribuciones})
     .pipe(finalize(()=>this.guardando=false))
     .subscribe({
       next:()=>{this.cambios.clear();this.mensaje='Distribución guardada correctamente.';this.refrescarCalculos();},
       error:e=>this.error=this.mensajeError(e,'No se pudo guardar la distribución.')
     });
 }

 seleccionar(id:number):void{
   this.seleccionado=id;
   this.api.getResumenTrabajador(id,this.anio,this.mes).subscribe({
     next:r=>this.resumen=r,
     error:()=>this.resumen=null
   });
 }

 refrescarCalculos():void{
   if(!this.plazaId)return;
   this.api.getCobertura(this.plazaId,this.anio,this.mes).subscribe(r=>this.cobertura=r);
   if(this.seleccionado)this.seleccionar(this.seleccionado);
 }

 count(u:CoberturaUbicacion,dia:number):number{return u.porDia[this.fecha(dia)]??0;}
 esOperativo(e:EstadoProgramacion|null):boolean{return e==='A'||e==='B'||e==='C';}
 claseEstado(e:EstadoProgramacion|null):string{return e?`estado-${e.toLowerCase()}`:'';}
 private fecha(dia:number):string{return`${this.anio}-${String(this.mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;}
 private mensajeError(e:any,fallback:string):string{return e?.error?.detail??e?.error?.message??fallback;}
}
