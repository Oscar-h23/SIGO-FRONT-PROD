import{CommonModule}from'@angular/common';
import{Component,OnInit,inject}from'@angular/core';
import{FormsModule}from'@angular/forms';
import{finalize,forkJoin}from'rxjs';
import{EstadoProgramacion,GrupoLider,Plaza,TrabajadorResumen}from'../../models/programacion.models';
import{ProgramacionApiService}from'../../services/programacion-api.service';

@Component({
 selector:'app-programacion-supervisor',
 standalone:true,
 imports:[CommonModule,FormsModule],
 templateUrl:'./programacion-supervisor.component.html',
 styleUrl:'./programacion-supervisor.component.css'
})
export class ProgramacionSupervisorComponent implements OnInit{
 private readonly api=inject(ProgramacionApiService);

 plazas:Plaza[]=[];
 agentes:TrabajadorResumen[]=[];
 controladores:TrabajadorResumen[]=[];
 grupos:GrupoLider[]=[];
 plazaId:number|null=null;
 anio=new Date().getFullYear();
 mes=new Date().getMonth()+1;
 dias:number[]=[];
 busqueda='';
 cargando=false;
 guardando=false;
 error='';
 mensaje='';
 readonly estados:EstadoProgramacion[]=['A','B','C','D','V','COM','DM','LIC'];
 readonly matrix=new Map<string,EstadoProgramacion|null>();
 readonly cambios=new Map<string,EstadoProgramacion>();
 liderSeleccionado:Record<number,number|null>={};

 get mesInput():string{return `${this.anio}-${String(this.mes).padStart(2,'0')}`;}

 ngOnInit():void{
   this.api.getPlazas().subscribe({
     next:plazas=>{
       this.plazas=plazas;
       this.plazaId=plazas.find(p=>p.codigo==='P4')?.id??plazas[0]?.id??null;
       if(this.plazaId)this.cargar();
     },
     error:e=>this.error=this.mensajeError(e,'No se pudieron cargar las plazas.')
   });
 }

 cambiarMes(value:string):void{
   if(!value)return;
   const [a,m]=value.split('-').map(Number);
   this.anio=a;this.mes=m;this.cargar();
 }

 cargar():void{
   if(!this.plazaId)return;
   this.cargando=true;this.error='';this.mensaje='';
   this.dias=Array.from({length:new Date(this.anio,this.mes,0).getDate()},(_,i)=>i+1);
   forkJoin({
     agentes:this.api.getAgentes(this.plazaId),
     controladores:this.api.getControladores(this.plazaId),
     turnos:this.api.getTurnos(this.plazaId,this.anio,this.mes),
     grupos:this.api.getGrupos(this.plazaId)
   }).pipe(finalize(()=>this.cargando=false)).subscribe({
     next:r=>{
       this.agentes=r.agentes;
       this.controladores=r.controladores;
       this.grupos=r.grupos;
       this.matrix.clear();
       this.cambios.clear();
       for(const t of r.turnos)this.matrix.set(this.key(t.trabajadorId,this.diaDeFecha(t.fecha)),t.estado);
       this.liderSeleccionado={};
       for(const a of this.agentes){
         const g=this.grupos.find(x=>x.agenteId===a.id&&x.activo);
         this.liderSeleccionado[a.id]=g?.controladorId??null;
       }
     },
     error:e=>this.error=this.mensajeError(e,'No se pudo cargar la programación.')
   });
 }

 get agentesFiltrados():TrabajadorResumen[]{
   const q=this.busqueda.trim().toLowerCase();
   return q?this.agentes.filter(a=>`${a.codigo} ${a.nombreCompleto}`.toLowerCase().includes(q)):this.agentes;
 }

 estado(agenteId:number,dia:number):EstadoProgramacion|null{
   return this.matrix.get(this.key(agenteId,dia))??null;
 }

 cambiarEstado(agenteId:number,dia:number,estado:EstadoProgramacion|null):void{
   if(!estado)return;
   const k=this.key(agenteId,dia);
   this.matrix.set(k,estado);
   this.cambios.set(k,estado);
 }

 guardar():void{
   if(!this.plazaId||this.cambios.size===0)return;
   const programaciones=[...this.cambios.entries()].map(([k,estado])=>{
     const [trabajadorId,dia]=k.split('-').map(Number);
     return{trabajadorId,fecha:this.fecha(dia),estado};
   });
   this.guardando=true;this.error='';this.mensaje='';
   this.api.guardarTurnos({plazaId:this.plazaId,programaciones})
     .pipe(finalize(()=>this.guardando=false))
     .subscribe({
       next:()=>{this.cambios.clear();this.mensaje='Programación guardada correctamente.';},
       error:e=>this.error=this.mensajeError(e,'No se pudo guardar la programación.')
     });
 }

 guardarLider(agente:TrabajadorResumen):void{
   if(!this.plazaId)return;
   const controladorId=this.liderSeleccionado[agente.id];
   if(!controladorId){this.error='Selecciona un controlador para el agente.';return;}
   this.error='';this.mensaje='';
   this.api.asignarLider({
     agenteId:agente.id,controladorId,plazaId:this.plazaId,fechaInicio:this.hoy()
   }).subscribe({
     next:g=>{
       this.grupos=this.grupos.filter(x=>x.agenteId!==agente.id);
       this.grupos.push(g);
       this.mensaje=`Líder actualizado para ${agente.nombreCompleto}.`;
     },
     error:e=>this.error=this.mensajeError(e,'No se pudo actualizar el líder.')
   });
 }

 claseEstado(e:EstadoProgramacion|null):string{return e?`estado-${e.toLowerCase()}`:'';}
 nombreMes():string{
   const t=new Intl.DateTimeFormat('es-PE',{month:'long',year:'numeric'}).format(new Date(this.anio,this.mes-1,1));
   return t.charAt(0).toUpperCase()+t.slice(1);
 }
 private key(id:number,dia:number):string{return`${id}-${dia}`;}
 private diaDeFecha(fecha:string):number{return Number(fecha.slice(8,10));}
 private fecha(dia:number):string{return`${this.anio}-${String(this.mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;}
 private hoy():string{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 private mensajeError(e:any,fallback:string):string{return e?.error?.detail??e?.error?.message??fallback;}
}
