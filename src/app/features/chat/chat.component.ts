import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostBinding, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ChatApiService, ChatTurnPayload } from './chat-api.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  time: Date;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent {
  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
  @Input() popup = false;
  @Output() cerrar = new EventEmitter<void>();
  @HostBinding('class.popup-mode') get popupMode(): boolean { return this.popup; }

  mensaje = '';
  enviando = false;
  error = '';
  mensajes: ChatMessage[] = [];

  readonly sugerencias = [
    '¿Qué pasó en P4 este mes?',
    '¿Qué vías estuvieron observadas?',
    '¿Cómo estuvo la asistencia de hoy?',
    '¿Hubo ausencias hoy?'
  ];

  constructor(
    private readonly api: ChatApiService,
    public readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async enviar(texto?: string): Promise<void> {
    const pregunta = (texto ?? this.mensaje).trim();
    if (!pregunta || this.enviando) return;

    const history: ChatTurnPayload[] = this.mensajes.slice(-6).map(item => ({
      role: item.role,
      text: item.text
    }));

    this.mensaje = '';
    this.error = '';
    this.mensajes.push({ role: 'user', text: pregunta, time: new Date() });
    this.enviando = true;
    this.cdr.detectChanges();
    this.scrollAbajo();

    try {
      const respuesta = await firstValueFrom(this.api.preguntar(pregunta, history));
      this.mensajes.push({
        role: 'assistant',
        text: respuesta?.response?.trim() || 'No encontré información suficiente para responderte.',
        time: new Date()
      });
    } catch (e: any) {
      this.error = e?.error?.message || e?.error?.detail || e?.error?.error || 'No se pudo consultar el asistente SIGO.';
      this.mensajes.push({
        role: 'assistant',
        text: 'Tuve un problema al consultar SIGO. Intenta nuevamente en unos segundos.',
        time: new Date()
      });
    } finally {
      this.enviando = false;
      this.cdr.detectChanges();
      this.scrollAbajo();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.enviar();
    }
  }

  nuevaConversacion(): void {
    if (this.enviando) return;
    this.mensajes = [];
    this.mensaje = '';
    this.error = '';
  }

  cerrarPopup(): void {
    if (!this.enviando) this.cerrar.emit();
  }

  private scrollAbajo(): void {
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }
}
