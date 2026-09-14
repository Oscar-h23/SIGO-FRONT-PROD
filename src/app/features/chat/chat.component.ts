import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ChatApiService } from './chat-api.service';

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

  mensaje = '';
  enviando = false;
  error = '';
  mensajes: ChatMessage[] = [];

  readonly sugerencias = [
    '¿Qué pasó en P4 este mes?',
    '¿Qué vías estuvieron observadas?',
    'Muéstrame las ausencias de hoy',
    '¿Cuál es el resumen de asistencia de hoy?'
  ];

  constructor(
    private readonly api: ChatApiService,
    public readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async enviar(texto?: string): Promise<void> {
    const pregunta = (texto ?? this.mensaje).trim();
    if (!pregunta || this.enviando) return;

    this.mensaje = '';
    this.error = '';
    this.mensajes.push({ role: 'user', text: pregunta, time: new Date() });
    this.enviando = true;
    this.cdr.detectChanges();
    this.scrollAbajo();

    try {
      const respuesta = await firstValueFrom(this.api.preguntar(pregunta));
      this.mensajes.push({
        role: 'assistant',
        text: respuesta?.response?.trim() || 'No se recibió una respuesta del asistente.',
        time: new Date()
      });
    } catch (e: any) {
      this.error = e?.error?.message || e?.error?.detail || e?.error?.error || 'No se pudo consultar el asistente SIGO.';
      this.mensajes.push({
        role: 'assistant',
        text: 'No pude procesar la consulta en este momento. Intenta nuevamente.',
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

  private scrollAbajo(): void {
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }
}
