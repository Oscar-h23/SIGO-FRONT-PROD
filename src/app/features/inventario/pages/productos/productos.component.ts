import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { InventarioApiService } from '../../services/inventario-api.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { CatalogoItem, ProductoAdmin } from '../../models/inventario.models';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './productos.component.html',
  styleUrl: './productos.component.css'
})
export class ProductosComponent implements OnInit {
  productos: ProductoAdmin[] = [];
  categorias: CatalogoItem[] = [];
  ambitos: CatalogoItem[] = [];
  roles: CatalogoItem[] = [];
  plazas: CatalogoItem[] = [];
  mensaje = '';
  error = '';
  guardando = false;

  form: any = this.nuevoFormulario();

  constructor(
    private api: InventarioApiService,
    public auth: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.cargarCatalogos();
      this.prepararPlazaControlador();
      await this.cargarProductos();
    } catch (e: any) {
      this.error = this.extraerError(e);
    }
  }

  esControlador(): boolean {
    return this.auth.tieneRol('CONTROLADOR');
  }

  esSupervisor(): boolean {
    return this.auth.tieneRol('SUPERVISOR');
  }

  productosVisibles(): ProductoAdmin[] {
    if (this.esSupervisor()) {
      return this.productos;
    }

    const plazaId = this.auth.usuario()?.plazaId;

    return this.productos.filter(producto =>
      producto.plazas?.some(plaza => plaza.plazaId === plazaId)
    );
  }

  async cargarProductos(): Promise<void> {
    this.productos = await firstValueFrom(this.api.productosAdmin());
  }

  async cargarCatalogos(): Promise<void> {
    this.categorias = await firstValueFrom(this.api.catalogo('categorias'));
    this.ambitos = await firstValueFrom(this.api.catalogo('ambitos'));
    this.roles = await firstValueFrom(this.api.catalogo('roles'));
    this.plazas = await firstValueFrom(this.api.catalogo('plazas'));
  }

  toggleRol(codigo: string): void {
    if (!codigo) return;

    // El controlador no puede asignar permisos de supervisor.
    if (this.esControlador() && codigo === 'SUPERVISOR') {
      return;
    }

    const index = this.form.roles.indexOf(codigo);

    if (index >= 0) {
      this.form.roles.splice(index, 1);
    } else {
      this.form.roles.push(codigo);
    }
  }

  togglePlaza(plazaId: number): void {
    if (this.esControlador()) {
      return;
    }

    const index = this.form.plazas.findIndex(
      (p: any) => p.plazaId === plazaId
    );

    if (index >= 0) {
      this.form.plazas.splice(index, 1);
    } else {
      this.form.plazas.push({
        plazaId,
        stockMinimo: 0
      });
    }
  }

  plazaSeleccionada(id: number): any {
    return this.form.plazas.find(
      (p: any) => p.plazaId === id
    );
  }

  async guardar(): Promise<void> {
    this.mensaje = '';
    this.error = '';

    if (!this.form.codigo?.trim() || !this.form.nombre?.trim()) {
      this.error = 'Código y nombre son obligatorios.';
      return;
    }

    if (!this.form.categoriaId || !this.form.ambitoId) {
      this.error = 'Selecciona categoría y ámbito.';
      return;
    }

    if (this.form.roles.length === 0) {
      this.error = 'Selecciona al menos un rol.';
      return;
    }

    this.prepararPlazaControlador();

    if (this.form.plazas.length === 0) {
      this.error = 'Selecciona al menos una plaza.';
      return;
    }

    this.guardando = true;

    try {
      await firstValueFrom(this.api.crearProducto(this.form));

      this.mensaje = 'Producto creado correctamente.';
      this.form = this.nuevoFormulario();
      this.prepararPlazaControlador();

      await this.cargarProductos();
    } catch (e: any) {
      this.error = this.extraerError(e);
    } finally {
      this.guardando = false;
    }
  }

  private prepararPlazaControlador(): void {
    if (!this.esControlador()) {
      return;
    }

    const plazaId = this.auth.usuario()?.plazaId;

    if (!plazaId) {
      return;
    }

    const existente = this.form.plazas.find(
      (p: any) => p.plazaId === plazaId
    );

    this.form.plazas = [
      {
        plazaId,
        stockMinimo: existente?.stockMinimo ?? 0
      }
    ];

    // Por defecto el nuevo producto queda visible para el controlador.
    if (!this.form.roles.includes('CONTROLADOR')) {
      this.form.roles.push('CONTROLADOR');
    }
  }

  private nuevoFormulario(): any {
    return {
      codigo: '',
      nombre: '',
      descripcion: '',
      categoriaId: null,
      ambitoId: null,
      unidadMedida: 'Unidad',
      activo: true,
      roles: [],
      plazas: []
    };
  }

  private extraerError(e: any): string {
    return e?.error?.message
      || e?.error?.detail
      || e?.error?.error
      || 'No se pudo completar la operación.';
  }
}
