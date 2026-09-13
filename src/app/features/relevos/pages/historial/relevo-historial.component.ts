import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { Plaza } from '../../../asistencia/models/asistencia.models';
import { AsistenciaApiService } from '../../../asistencia/services/asistencia-api.service';
import { RelevoResponse } from '../../models/relevo.models';
import { RelevoApiService } from '../../services/relevo-api.service';

@Component({
  selector: 'app-relevo-historial',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './relevo-historial.component.html',
  styleUrl: '../../../../shared/page.css'
})
export class RelevoHistorialComponent implements OnInit {
  private readonly api = inject(RelevoApiService);
  private readonly catalogos = inject(AsistenciaApiService);
  readonly auth = inject(AuthService);

  readonly cargando = signal(false);
  readonly error = signal('');

  relevos: RelevoResponse[] = [];
  plazas: Plaza[] = [];

  inicio = '';
  fin = '';
  plazaId: number | null = null;

  get esOperador(): boolean {
    return this.auth.usuario()?.rol === 'OPERADOR';
  }

  ngOnInit(): void {
    const hoy = this.fechaHoy();
    this.inicio = hoy;
    this.fin = hoy;

    const usuario = this.auth.usuario();
    if (this.esOperador) {
      this.plazaId = usuario?.plazaId ?? null;
      this.buscar();
      return;
    }

    this.catalogos.getPlazas().subscribe({
      next: data => {
        this.plazas = (data ?? []).filter(item => item.activo !== false);
        this.buscar();
      },
      error: () => {
        this.error.set('No se pudieron cargar las plazas.');
        this.buscar();
      }
    });
  }

  buscar(): void {
    if (this.cargando()) return;

    this.error.set('');

    if (!this.inicio || !this.fin) {
      this.error.set('Selecciona las fechas de búsqueda.');
      return;
    }

    if (this.inicio > this.fin) {
      this.error.set('La fecha inicial no puede ser posterior a la fecha final.');
      return;
    }

    this.cargando.set(true);

    this.api.listar(this.inicio, this.fin).subscribe({
      next: data => {
        let items = (data ?? []).map(item => ({
          ...item,
          checklist: item.checklist ?? [],
          vias: item.vias ?? []
        }));

        if (this.esOperador) {
          const usuario = this.auth.usuario();
          items = items.filter(item =>
            item.fecha === this.fechaHoy() &&
            item.plazaId === usuario?.plazaId
          );
        } else if (this.plazaId) {
          items = items.filter(item => item.plazaId === this.plazaId);
        }

        this.relevos = items.sort((a, b) => this.fechaHoraNumero(b) - this.fechaHoraNumero(a));
        this.cargando.set(false);
      },
      error: err => {
        this.cargando.set(false);
        this.error.set(err?.error?.message ?? 'No se pudo cargar el historial de relevos.');
      }
    });
  }

  limpiarFiltros(): void {
    const hoy = this.fechaHoy();
    this.inicio = hoy;
    this.fin = hoy;
    this.plazaId = null;
    this.buscar();
  }

  totalVias(relevo: RelevoResponse): number {
    return relevo.vias?.length ?? 0;
  }

  viasConObservacion(relevo: RelevoResponse): number {
    return relevo.vias?.filter(via => via.estado === 'OBSERVADO' || via.estado === 'NO_OPERATIVO').length ?? 0;
  }

  checklistConObservacion(relevo: RelevoResponse): number {
    return relevo.checklist?.filter(item => item.estado === 'OBSERVADO' || item.estado === 'NO_OPERATIVO').length ?? 0;
  }

  horaCorta(hora: string): string {
    return hora?.slice(0, 5) || '--:--';
  }

  private fechaHoraNumero(relevo: RelevoResponse): number {
    const valor = new Date(`${relevo.fecha}T${relevo.hora || '00:00:00'}`).getTime();
    return Number.isNaN(valor) ? 0 : valor;
  }

  private fechaHoy(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
  }
}
