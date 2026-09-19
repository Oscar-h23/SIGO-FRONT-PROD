export type EstadoProgramacion='A'|'B'|'C'|'D'|'V'|'COM'|'DM'|'LIC';
export type TipoUbicacion='VIA'|'AUXILIAR'|'APOYO';

export interface Plaza{ id:number; codigo:string; descripcion?:string|null; activo?:boolean; }
export interface TrabajadorResumen{
  id:number; codigo:number; nombreCompleto:string;
  puesto?:{id:number;nombre:string}|null;
  plaza?:{id:number;codigo:string;descripcion?:string|null}|null;
  rolSistema?:'SUPERVISOR'|'CONTROLADOR'|'OPERADOR';
  activo?:boolean;
}
export interface ProgramacionDia{
  programacionId:number; trabajadorId:number; codigoTrabajador:number; nombreTrabajador:string;
  plazaId:number; plazaCodigo:string; fecha:string; estado:EstadoProgramacion;
}
export interface TurnoItemRequest{ trabajadorId:number; fecha:string; estado:EstadoProgramacion; }
export interface GuardarProgramacionRequest{ plazaId:number; programaciones:TurnoItemRequest[]; }
export interface Ubicacion{
  id:number; plazaId:number; codigo:string; nombre:string; tipo:TipoUbicacion;
  viaId:number|null; activo:boolean; orden:number;
}
export interface DistribucionDia{
  distribucionId:number; programacionTurnoId:number; trabajadorId:number; codigoTrabajador:number;
  nombreTrabajador:string; fecha:string; estado:EstadoProgramacion; ubicacionId:number;
  ubicacionCodigo:string; ubicacionNombre:string; ubicacionTipo:TipoUbicacion; observacion?:string|null;
}
export interface DistribucionItemRequest{ programacionTurnoId:number; ubicacionId:number; observacion?:string|null; }
export interface GuardarDistribucionRequest{ plazaId:number; distribuciones:DistribucionItemRequest[]; }
export interface HorarioDia{ fecha:string; estado:EstadoProgramacion|null; ubicacionCodigo:string|null; ubicacionNombre:string|null; }
export interface MiHorario{
  trabajadorId:number; codigo:number; nombre:string; plazaId:number|null; plazaCodigo:string|null;
  lider:string|null; dias:HorarioDia[];
}
export interface GrupoLider{
  id:number; agenteId:number; agenteCodigo:number; agenteNombre:string;
  controladorId:number; controladorCodigo:number; controladorNombre:string;
  plazaId:number; plazaCodigo:string; fechaInicio:string; fechaFin:string|null; activo:boolean;
}
export interface GrupoLiderRequest{ agenteId:number; controladorId:number; plazaId:number; fechaInicio?:string|null; }
export interface ResumenUbicacion{ codigo:string; nombre:string; veces:number; }
export interface ResumenTrabajador{ trabajadorId:number; codigo:number; nombre:string; ubicaciones:ResumenUbicacion[]; }
export interface CoberturaUbicacion{ ubicacionId:number; codigo:string; nombre:string; porDia:Record<string,number>; }
