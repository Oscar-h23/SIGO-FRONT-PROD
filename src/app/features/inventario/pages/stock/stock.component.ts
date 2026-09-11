import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { InventarioApiService } from '../../services/inventario-api.service';
import { StockActual } from '../../models/inventario.models';

@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stock.component.html',
  styleUrl: './stock.component.css'
})
export class StockComponent implements OnInit {
  items: StockActual[] = [];
  constructor(private api: InventarioApiService) {}
  async ngOnInit() {
    this.items = await firstValueFrom(this.api.stock());
  }
}
