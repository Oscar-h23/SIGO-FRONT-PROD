import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { InventarioApiService } from '../../services/inventario-api.service';
import { InventarioDetalle, InventarioResumen } from '../../models/inventario.models';

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.css'
})
export class HistorialComponent implements OnInit {
  items: InventarioResumen[] = [];
  detalle: InventarioDetalle | null = null;
  cargando = true;

  constructor(private api: InventarioApiService) {}

  async ngOnInit() {
    try {
      const r = await firstValueFrom(this.api.historial());
      this.items = r?.content ?? [];
    } finally { this.cargando = false; }
  }

  async ver(id: number) {
    this.detalle = await firstValueFrom(this.api.detalle(id));
  }
}
