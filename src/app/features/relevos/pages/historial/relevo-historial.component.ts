import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { jsPDF } from 'jspdf';

import { AuthService } from '../../../../core/auth/auth.service';
import { Plaza } from '../../../asistencia/models/asistencia.models';
import { AsistenciaApiService } from '../../../asistencia/services/asistencia-api.service';
import { RelevoChecklistResponse, RelevoResponse, RelevoViaResponse } from '../../models/relevo.models';
import { RelevoApiService } from '../../services/relevo-api.service';

@Component({ selector: 'app-relevo-historial', standalone: true, imports: [CommonModule, FormsModule, RouterLink], templateUrl: './relevo-historial.component.html', styleUrl: '../../../../shared/page.css' })
export class RelevoHistorialComponent implements OnInit {
  private readonly api = inject(RelevoApiService);
  private readonly catalogos = inject(AsistenciaApiService);
  readonly auth = inject(AuthService);
  readonly cargando = signal(false); readonly error = signal(''); readonly detalleSeleccionado = signal<RelevoResponse | null>(null); readonly generandoPdfId = signal<number | null>(null);
  relevos: RelevoResponse[] = []; plazas: Plaza[] = []; inicio = ''; fin = ''; plazaId: number | null = null;
  get esOperador(): boolean { return this.auth.usuario()?.rol === 'OPERADOR'; }

  ngOnInit(): void {
    const hoy=this.fechaHoy();
    this.inicio=this.esOperador?this.fechaInicioVentanaOperador():hoy;
    this.fin=hoy;
    const usuario=this.auth.usuario();
    if(this.esOperador){this.plazaId=usuario?.plazaId??null;this.buscar();return;}
    this.catalogos.getPlazas().subscribe({next:data=>{this.plazas=(data??[]).filter(i=>i.activo!==false);this.buscar();},error:()=>{this.error.set('No se pudieron cargar las plazas.');this.buscar();}});
  }
  buscar(): void {
    if(this.cargando())return;
    this.error.set('');
    if(!this.inicio||!this.fin)return this.error.set('Selecciona las fechas de búsqueda.');
    if(this.inicio>this.fin)return this.error.set('La fecha inicial no puede ser posterior a la fecha final.');
    this.cargando.set(true);
    this.api.listar(this.inicio,this.fin).subscribe({
      next:data=>{
        let items=(data??[]).map(i=>({...i,checklist:i.checklist??[],vias:i.vias??[]}));
        if(this.esOperador){
          items=this.filtrarHistorialOperador(items);
        }else if(this.plazaId){
          items=items.filter(i=>i.plazaId===this.plazaId);
        }
        this.relevos=items.sort((a,b)=>this.fechaHoraNumero(b)-this.fechaHoraNumero(a));
        this.cargando.set(false);
      },
      error:err=>{this.cargando.set(false);this.error.set(err?.error?.message??'No se pudo cargar el historial de relevos.');}
    });
  }
  limpiarFiltros():void{const hoy=this.fechaHoy();this.inicio=this.esOperador?this.fechaInicioVentanaOperador():hoy;this.fin=hoy;if(!this.esOperador)this.plazaId=null;this.buscar();}
  abrirDetalle(r:RelevoResponse):void{this.detalleSeleccionado.set(r);document.body.style.overflow='hidden';} cerrarDetalle():void{this.detalleSeleccionado.set(null);document.body.style.overflow='';}
  baseOperativa(r:RelevoResponse){return r.checklist.filter(i=>i.categoria==='BASE_OPERATIVA');} plazaPeaje(r:RelevoResponse){return r.checklist.filter(i=>i.categoria==='PLAZA_PEAJE');}
  totalVias(r:RelevoResponse){return r.vias?.length??0;} viasConObservacion(r:RelevoResponse){return r.vias?.filter(v=>v.estado==='OBSERVADO'||v.estado==='NO_OPERATIVO').length??0;} checklistConObservacion(r:RelevoResponse){return r.checklist?.filter(i=>i.estado==='OBSERVADO'||i.estado==='NO_OPERATIVO').length??0;}
  horaCorta(h:string){return h?.slice(0,5)||'--:--';} estadoLabel(e:string){if(e==='NO_OPERATIVO')return 'No operativo';if(e==='OBSERVADO')return 'Observado';return 'Operativo';}

  async generarPdf(relevo: RelevoResponse): Promise<void> {
    if(this.generandoPdfId()!==null)return; this.generandoPdfId.set(relevo.id); this.error.set('');
    try {
      const pdf=new jsPDF({unit:'mm',format:'a4'}); let y=14;
      const logo=await this.assetDataUrl('assets/logo-lima-expresa.png');
      this.encabezadoPdf(pdf,logo,relevo); y=48;
      y=this.bloqueDatos(pdf,relevo,y);
      y=this.dibujarSeccion(pdf,'BASE OPERATIVA',this.baseOperativa(relevo),y,logo,relevo);
      y=this.dibujarSeccion(pdf,'PLAZA DE PEAJE',this.plazaPeaje(relevo),y,logo,relevo);
      y=this.dibujarVias(pdf,relevo.vias,y,logo,relevo);
      if(relevo.resumen||relevo.observaciones){ y=this.ensureSpace(pdf,y,42,logo,relevo); this.tituloSeccion(pdf,'RESUMEN Y OBSERVACIONES',y); y+=8; if(relevo.resumen)y=this.cajaTexto(pdf,'Resumen',relevo.resumen,y); if(relevo.observaciones)y=this.cajaTexto(pdf,'Observaciones',relevo.observaciones,y); }
      await this.agregarEvidenciasPdf(pdf,relevo,logo); this.numerarPaginas(pdf); pdf.save(`relevo_${relevo.fecha}_${relevo.plazaCodigo}_turno_${relevo.turnoCodigo}.pdf`);
    } catch(err){console.error(err);this.error.set('No se pudo generar el PDF del relevo.');} finally{this.generandoPdfId.set(null);}
  }

  private filtrarHistorialOperador(items:RelevoResponse[]):RelevoResponse[]{
    const u=this.auth.usuario();
    if(!u?.trabajadorId||!u?.plazaId)return [];
    const plaza=items.filter(i=>i.plazaId===u.plazaId).sort((a,b)=>this.fechaHoraNumero(b)-this.fechaHoraNumero(a));
    const propios=plaza.filter(i=>i.operadorId===u.trabajadorId);
    const ids=new Set(propios.map(i=>i.id));
    const ultimoPropio=propios[0];
    let anterior:RelevoResponse|undefined;
    if(ultimoPropio){
      const fechaUltimo=this.fechaHoraNumero(ultimoPropio);
      anterior=plaza.find(i=>i.id!==ultimoPropio.id&&this.fechaHoraNumero(i)<fechaUltimo);
    }else{
      anterior=plaza[0];
    }
    if(anterior)ids.add(anterior.id);
    return plaza.filter(i=>ids.has(i.id));
  }

  private encabezadoPdf(pdf:jsPDF,logo:string|null,relevo:RelevoResponse):void{
    pdf.setFillColor(255,255,255);pdf.rect(0,0,210,36,'F');
    if(logo){try{pdf.addImage(logo,'PNG',14,7,42,20,undefined,'FAST');}catch{}}
    pdf.setTextColor(15,23,42);pdf.setFont('helvetica','bold');pdf.setFontSize(16);pdf.text('REPORTE DE RELEVO DE TURNO',196,13,{align:'right'});
    pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);pdf.setTextColor(71,85,105);pdf.text('SIGO · Sistema de Gestión Operativa',196,20,{align:'right'});pdf.text(`Plaza ${relevo.plazaCodigo} · Turno ${relevo.turnoCodigo}`,196,26,{align:'right'});
    pdf.setDrawColor(37,99,235);pdf.setLineWidth(1.3);pdf.line(14,35,196,35);pdf.setTextColor(15,23,42);
  }
  private bloqueDatos(pdf:jsPDF,r:RelevoResponse,y:number):number{pdf.setFillColor(248,250,252);pdf.setDrawColor(226,232,240);pdf.roundedRect(14,y,182,31,3,3,'FD');const datos=[['PLAZA',`${r.plazaCodigo}${r.plazaDescripcion?' · '+r.plazaDescripcion:''}`],['FECHA',r.fecha],['HORA',this.horaCorta(r.hora)],['TURNO',r.turnoCodigo],['REGISTRADO POR',r.operadorNombre]];const xs=[20,78,112,143,164],widths=[52,28,25,17,27];datos.forEach((d,i)=>{pdf.setFont('helvetica','bold');pdf.setFontSize(6.8);pdf.setTextColor(100,116,139);pdf.text(d[0],xs[i],y+9);pdf.setFontSize(8.8);pdf.setTextColor(15,23,42);pdf.text(pdf.splitTextToSize(d[1],widths[i]),xs[i],y+16);});return y+40;}
  private tituloSeccion(pdf:jsPDF,t:string,y:number):void{pdf.setFillColor(239,246,255);pdf.roundedRect(14,y,182,8,2,2,'F');pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.setTextColor(29,78,216);pdf.text(t,18,y+5.4);pdf.setTextColor(15,23,42);}
  private dibujarSeccion(pdf:jsPDF,t:string,items:RelevoChecklistResponse[],y:number,logo:string|null,r:RelevoResponse):number{y=this.ensureSpace(pdf,y,20,logo,r);this.tituloSeccion(pdf,t,y);y+=12;for(const item of items){const lines=pdf.splitTextToSize(item.detalle||'Sin observaciones',118),cant=item.cantidad!==null?` · Cantidad: ${item.cantidad}`:'',h=Math.max(13,8+lines.length*3.5);y=this.ensureSpace(pdf,y,h+3,logo,r);pdf.setDrawColor(226,232,240);pdf.roundedRect(14,y,182,h,2,2,'S');pdf.setFont('helvetica','bold');pdf.setFontSize(8.5);pdf.text(`${item.nombre}${cant}`,18,y+5.5);this.badgeEstado(pdf,item.estado,190,y+5.5);pdf.setFont('helvetica','normal');pdf.setFontSize(7.5);pdf.setTextColor(71,85,105);pdf.text(lines,18,y+10.5);pdf.setTextColor(15,23,42);y+=h+3;}return y+3;}
  private dibujarVias(pdf:jsPDF,vias:RelevoViaResponse[],y:number,logo:string|null,r:RelevoResponse):number{y=this.ensureSpace(pdf,y,20,logo,r);this.tituloSeccion(pdf,'REPORTE DE VÍAS',y);y+=12;for(const v of vias){const lines=pdf.splitTextToSize(v.detalle||'Sin observaciones',118),h=Math.max(13,8+lines.length*3.5);y=this.ensureSpace(pdf,y,h+3,logo,r);pdf.setDrawColor(226,232,240);pdf.roundedRect(14,y,182,h,2,2,'S');pdf.setFont('helvetica','bold');pdf.setFontSize(8.5);pdf.text(`Vía ${v.numero}${v.nombre?' · '+v.nombre:''}`,18,y+5.5);this.badgeEstado(pdf,v.estado,190,y+5.5);pdf.setFont('helvetica','normal');pdf.setFontSize(7.5);pdf.setTextColor(71,85,105);pdf.text(lines,18,y+10.5);pdf.setTextColor(15,23,42);y+=h+3;}return y+3;}
  private badgeEstado(pdf:jsPDF,e:string,x:number,y:number):void{const label=this.estadoLabel(e),w=e==='NO_OPERATIVO'?25:e==='OBSERVADO'?20:18;if(e==='OPERATIVO'){pdf.setFillColor(220,252,231);pdf.setTextColor(21,128,61);}else if(e==='OBSERVADO'){pdf.setFillColor(254,243,199);pdf.setTextColor(180,83,9);}else{pdf.setFillColor(254,226,226);pdf.setTextColor(185,28,28);}pdf.roundedRect(x-w,y-4.3,w,6,2,2,'F');pdf.setFont('helvetica','bold');pdf.setFontSize(6.5);pdf.text(label,x-w/2,y,{align:'center'});pdf.setTextColor(15,23,42);}
  private cajaTexto(pdf:jsPDF,l:string,t:string,y:number):number{const lines=pdf.splitTextToSize(t,170),h=11+lines.length*4;pdf.setFillColor(248,250,252);pdf.setDrawColor(226,232,240);pdf.roundedRect(14,y,182,h,2,2,'FD');pdf.setFont('helvetica','bold');pdf.setFontSize(7.5);pdf.setTextColor(100,116,139);pdf.text(l.toUpperCase(),18,y+5);pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);pdf.setTextColor(30,41,59);pdf.text(lines,18,y+10);return y+h+4;}
  private ensureSpace(pdf:jsPDF,y:number,n:number,logo:string|null,r:RelevoResponse):number{if(y+n<=278)return y;pdf.addPage();this.encabezadoPdf(pdf,logo,r);return 46;}
  private async agregarEvidenciasPdf(pdf:jsPDF,r:RelevoResponse,logo:string|null):Promise<void>{const ev:{titulo:string;subtitulo:string;url:string}[]=[];for(const i of r.checklist)for(const e of i.evidencias??[])ev.push({titulo:i.nombre,subtitulo:this.estadoLabel(i.estado),url:e.urlArchivo});for(const v of r.vias)for(const e of v.evidencias??[])ev.push({titulo:`Vía ${v.numero}`,subtitulo:this.estadoLabel(v.estado),url:e.urlArchivo});if(!ev.length)return;for(let i=0;i<ev.length;i+=4){pdf.addPage();this.encabezadoPdf(pdf,logo,r);this.tituloSeccion(pdf,'EVIDENCIAS FOTOGRÁFICAS',46);const lote=ev.slice(i,i+4);for(let j=0;j<lote.length;j++){const col=j%2,row=Math.floor(j/2),x=25+col*92,y=60+row*108;pdf.setFont('helvetica','bold');pdf.setFontSize(8.5);pdf.setTextColor(15,23,42);pdf.text(lote[j].titulo,x,y);pdf.setFont('helvetica','normal');pdf.setFontSize(7);pdf.setTextColor(100,116,139);pdf.text(lote[j].subtitulo,x,y+4);const data=await this.imagenDataUrl(lote[j].url),w=54,h=72;if(data){try{pdf.addImage(data,'JPEG',x,y+8,w,h,undefined,'FAST');}catch{}}pdf.setDrawColor(203,213,225);pdf.roundedRect(x,y+8,w,h,2,2,'S');}}}
  private numerarPaginas(pdf:jsPDF):void{const total=pdf.getNumberOfPages();for(let p=1;p<=total;p++){pdf.setPage(p);pdf.setDrawColor(226,232,240);pdf.line(14,287,196,287);pdf.setFont('helvetica','normal');pdf.setFontSize(7);pdf.setTextColor(100,116,139);pdf.text('Lima Expresa · SIGO · Documento generado por el sistema',14,292);pdf.text(`Página ${p} de ${total}`,196,292,{align:'right'});}}
  private async assetDataUrl(p:string):Promise<string|null>{try{const res=await fetch(p);if(!res.ok)return null;return await this.blobDataUrl(await res.blob());}catch{return null;}} private async imagenDataUrl(u:string):Promise<string|null>{try{const res=await fetch(u);if(!res.ok)return null;return await this.blobDataUrl(await res.blob());}catch{return null;}} private blobDataUrl(b:Blob):Promise<string|null>{return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(typeof reader.result==='string'?reader.result:null);reader.onerror=()=>resolve(null);reader.readAsDataURL(b);});}
  private fechaHoraNumero(r:RelevoResponse):number{const v=new Date(`${r.fecha}T${r.hora||'00:00:00'}`).getTime();return Number.isNaN(v)?0:v;}
  private fechaHoy():string{const now=new Date(),offset=now.getTimezoneOffset();return new Date(now.getTime()-offset*60000).toISOString().slice(0,10);}
  private fechaInicioVentanaOperador():string{const now=new Date();if(now.getHours()>=14)return this.fechaHoy();const anterior=new Date(now);anterior.setDate(anterior.getDate()-1);const offset=anterior.getTimezoneOffset();return new Date(anterior.getTime()-offset*60000).toISOString().slice(0,10);}
}