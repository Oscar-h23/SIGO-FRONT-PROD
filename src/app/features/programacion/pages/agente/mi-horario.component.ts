import{CommonModule}from'@angular/common';
import{Component,OnInit,inject}from'@angular/core';
import{finalize}from'rxjs';
import{EstadoProgramacion,HorarioDia,MiHorario}from'../../models/programacion.models';
import{ProgramacionApiService}from'../../services/programacion-api.service';

@Component({
 selector:'app-mi-horario',
 standalone:true,
 imports:[CommonModule],
 templateUrl:'./mi-horario.component.html',
 styleUrl:'./mi-horario.component.css'
})
export class MiHorarioComponent implements OnInit{
 private readonly api=inject(ProgramacionApiService);
 horario:MiHorario|null=null;
 inicio=this.inicioSemana(new Date());
 cargando=false;
 error='';

 ngOnInit():void{this.cargar();}

 cargar():void{
   this.cargando=true;this.error='';
   const fin=this.addDays(this.inicio,6);
   this.api.getMiHorario(this.iso(this.inicio),this.iso(fin))
     .pipe(finalize(()=>this.cargando=false))
     .subscribe({
       next:r=>this.horario=r,
       error:e=>this.error=e?.error?.detail??e?.error?.message??'No se pudo cargar tu horario.'
     });
 }

 anterior():void{this.inicio=this.addDays(this.inicio,-7);this.cargar();}
 siguiente():void{this.inicio=this.addDays(this.inicio,7);this.cargar();}

 get tituloSemana():string{
   const fin=this.addDays(this.inicio,6);
   const fmt=new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short'});
   return `${fmt.format(this.inicio)} - ${fmt.format(fin)}`;
 }

 diaSemana(d:HorarioDia):string{return new Intl.DateTimeFormat('es-PE',{weekday:'long'}).format(this.parse(d.fecha));}
 diaNumero(d:HorarioDia):string{return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short'}).format(this.parse(d.fecha));}

 label(e:EstadoProgramacion|null):string{
   const labels:Record<EstadoProgramacion,string>={
     A:'Turno A',B:'Turno B',C:'Turno C',D:'Descanso',
     V:'Vacaciones',COM:'Compensación',DM:'Descanso médico',LIC:'Licencia'
   };
   return e?labels[e]:'Sin programación';
 }
 operativo(e:EstadoProgramacion|null):boolean{return e==='A'||e==='B'||e==='C';}
 clase(e:EstadoProgramacion|null):string{return e?`estado-${e.toLowerCase()}`:'estado-sin';}

 private inicioSemana(date:Date):Date{
   const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());
   const diff=(d.getDay()+6)%7;d.setDate(d.getDate()-diff);return d;
 }
 private addDays(d:Date,n:number):Date{const x=new Date(d);x.setDate(x.getDate()+n);return x;}
 private iso(d:Date):string{return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 private parse(s:string):Date{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);}
}
