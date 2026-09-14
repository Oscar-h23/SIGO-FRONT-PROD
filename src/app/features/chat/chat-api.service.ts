import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ChatResponse {
  response: string;
}

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly api = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  preguntar(message: string) {
    return this.http.post<ChatResponse>(`${this.api}/chat`, { message });
  }
}
