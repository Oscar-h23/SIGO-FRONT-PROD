export type RolSistema='SUPERVISOR'|'CONTROLADOR'|'OPERADOR';
export type ModuloSigo='DASHBOARD'|'RELEVOS'|'ASISTENCIA'|'INVENTARIO'|'ADMIN_PRODUCTOS'|'TRABAJADORES'|'CHAT'|'PROGRAMACION'|'DISTRIBUCION'|'MI_HORARIO';

export interface UsuarioSesion{
 id:number;
 trabajadorId?:number;
 codigo:number;
 nombre:string;
 rol:RolSistema;
 plazaId:number|null;
 plaza:string|null;
 modulos:ModuloSigo[];
 requiereCambioPassword?:boolean;
}
export interface LoginResponse{
 token:string;
 tipo:string;
 expiresIn:number;
 requiereCambioPassword?:boolean;
 usuario:UsuarioSesion;
}
