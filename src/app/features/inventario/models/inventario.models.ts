export interface ProductoInventario {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  unidadMedida: string;
  categoriaId: number | null;
  categoria: string | null;
  ambitoId: number | null;
  ambito: string | null;
}

export interface InventarioResumen {
  id: number;
  plazaId: number;
  plaza: string;
  responsableId: number;
  codigoResponsable: number;
  responsable: string;
  rol: string;
  fechaInicio: string;
  fechaFinalizacion: string | null;
  estado: 'EN_PROCESO' | 'FINALIZADO' | 'ANULADO';
  productosRegistrados: number;
}

export interface InventarioDetalle {
  id: number;
  plazaId: number;
  plaza: string;
  responsableId: number;
  codigoResponsable: number;
  responsable: string;
  rol: string;
  fechaInicio: string;
  fechaFinalizacion: string | null;
  estado: string;
  observacion: string | null;
  motivoAnulacion: string | null;
  productos: InventarioDetalleItem[];
}

export interface InventarioDetalleItem {
  productoId: number;
  nombre: string;
  unidad: string;
  categoria: string | null;
  ambito: string | null;
  cantidad: number;
}

export interface StockActual {
  plazaId: number;
  plaza: string;
  productoId: number;
  producto: string;
  unidadMedida: string;
  cantidadActual: number;
  stockMinimo: number;
  bajoMinimo: boolean;
  inventarioId: number;
  actualizadoEn: string;
}

export interface ProductoAdmin {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoriaId: number | null;
  categoria: string | null;
  ambitoId: number | null;
  ambito: string | null;
  unidadMedida: string;
  activo: boolean;
  roles: string[];
  plazas: {
    plazaId: number;
    plaza: string;
    stockMinimo: number;
  }[];
}

export interface CatalogoItem {
  id: number;
  codigo: string | null;
  nombre: string;
}
