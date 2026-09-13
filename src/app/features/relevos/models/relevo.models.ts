export type EstadoOperativo = 'OPERATIVO' | 'OBSERVADO' | 'NO_OPERATIVO';

export interface Via {
  id: number;
  plazaId?: number;
  numero: number;
  nombre: string | null;
  activa?: boolean;
  orden?: number;
}

export interface ElementoRelevo {
  id: number;
  codigo: string;
  nombre: string;
  categoria: 'BASE_OPERATIVA' | 'PLAZA_PEAJE';
  requiereCantidad: boolean;
  activo?: boolean;
  orden: number;
}

export interface RelevoChecklistRequest {
  elementoId: number;
  estado: EstadoOperativo;
  detalle: string | null;
  cantidad: number | null;
}

export interface RelevoViaRequest {
  viaId: number;
  estado: EstadoOperativo;
  detalle: string | null;
}

export interface RelevoRequest {
  plazaId: number;
  turnoId: number;
  operadorId: number;
  fecha: string;
  hora: string;
  checklist: RelevoChecklistRequest[];
  vias: RelevoViaRequest[];
  observaciones: string | null;
  resumen: string | null;
}

export interface EvidenciaRelevoResponse {
  id: number;
  urlArchivo: string;
  publicId: string | null;
  tipo: string;
  createdAt: string;
}

export interface RelevoChecklistResponse {
  id: number;
  elementoId: number;
  codigo: string;
  nombre: string;
  categoria: 'BASE_OPERATIVA' | 'PLAZA_PEAJE';
  estado: EstadoOperativo;
  detalle: string | null;
  cantidad: number | null;
  evidencias: EvidenciaRelevoResponse[];
}

export interface RelevoViaResponse {
  id: number;
  viaId: number;
  numero: number;
  nombre: string | null;
  estado: EstadoOperativo;
  detalle: string | null;
  evidencias: EvidenciaRelevoResponse[];
}

export interface RelevoResponse {
  id: number;
  plazaId: number;
  plazaCodigo: string;
  plazaDescripcion: string | null;
  turnoId: number;
  turnoCodigo: string;
  turnoNombre: string;
  operadorId: number;
  operadorCodigo: number;
  operadorNombre: string;
  fecha: string;
  hora: string;
  observaciones: string | null;
  resumen: string | null;
  createdAt: string;
  updatedAt: string;
  checklist: RelevoChecklistResponse[];
  vias: RelevoViaResponse[];
}
