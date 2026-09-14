import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface TrabajadorAdmin {
  id: number;
  codigo: number;
  nombreCompleto: string;
  puesto?: { id: number; nombre: string } | null;
  plaza?: { id: number; codigo: string; descripcion?: string | null } | null;
  rolSistema: 'SUPERVISOR' | 'CONTROLADOR' | 'OPERADOR';
  requiereCambioPassword: boolean;
  activo: boolean;
}

@Component({
  selector: 'app-password-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './password-admin.component.html',
  styleUrl: './password-admin.component.css'
})
export class PasswordAdminComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly api = environment.apiUrl;

  trabajadores: TrabajadorAdmin[] = [];
  filtro = '';
  cargando = false;
  guardando = false;
  error = '';
  exito = '';

  modal = false;
  seleccionado: TrabajadorAdmin | null = null;
  passwordNueva = '';
  confirmar = '';
  exigirCambio = true;

  ngOnInit(): void { void this.cargar(); }

  get visibles(): TrabajadorAdmin[] {
    const q = this.filtro.trim().toLowerCase();
    return this.trabajadores.filter(t => !q || `${t.codigo} ${t.nombreCompleto} ${t.plaza?.codigo ?? ''} ${t.rolSistema}`.toLowerCase().includes(q));
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    this.error = '';
    try {
      this.trabajadores = await firstValueFrom(this.http.get<TrabajadorAdmin[]>(`${this.api}/trabajadores`));
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron cargar los trabajadores.';
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  abrir(t: TrabajadorAdmin): void {
    this.seleccionado = t;
    this.passwordNueva = '';
    this.confirmar = '';
    this.exigirCambio = true;
    this.error = '';
    this.exito = '';
    this.modal = true;
  }

  cerrar(): void {
    if (this.guardando) return;
    this.modal = false;
    this.seleccionado = null;
  }

  async guardar(): Promise<void> {
    if (!this.seleccionado || this.guardando) return;
    if (this.passwordNueva.length < 5) {
      this.error = 'La contraseña debe tener al menos 5 caracteres.';
      return;
    }
    if (this.passwordNueva !== this.confirmar) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }

    this.guardando = true;
    this.error = '';
    try {
      await firstValueFrom(this.http.put<void>(`${this.api}/auth/admin/trabajadores/${this.seleccionado.id}/password`, {
        passwordNueva: this.passwordNueva,
        exigirCambioAlIngresar: this.exigirCambio
      }));
      const id = this.seleccionado.id;
      this.trabajadores = this.trabajadores.map(t => t.id === id ? { ...t, requiereCambioPassword: this.exigirCambio } : t);
      this.exito = `Contraseña actualizada para ${this.seleccionado.nombreCompleto}.`;
      this.modal = false;
      this.seleccionado = null;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar la contraseña.';
    } finally {
      this.guardando = false;
      this.cdr.detectChanges();
    }
  }
}
