import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ImageCroppedEvent, ImageCropperComponent, ImageTransform } from 'ngx-image-cropper';

@Component({
  selector: 'app-image-cropper-modal',
  standalone: true,
  imports: [CommonModule, ImageCropperComponent],
  templateUrl: './image-cropper-modal.component.html',
  styleUrl: './image-cropper-modal.component.css'
})
export class ImageCropperModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() imageFile: File | null = null;
  @Input() titulo = 'Editar fotografía';
  @Input() aspectRatio = 100 / 70;
  @Input() aspectRatioLabel = '10:7';
  @Input() outputWidth = 1200;
  @Input() outputHeight = 840;

  @Output() cancelar = new EventEmitter<void>();
  @Output() confirmar = new EventEmitter<File>();

  croppedBlob: Blob | null = null;
  previewUrl: string | null = null;
  loading = false;
  error = '';
  scale = 1;
  rotation = 0;
  transform: ImageTransform = { scale: 1, rotate: 0 };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['imageFile'] && this.imageFile) {
      this.resetEditor();
    }
  }

  imageCropped(event: ImageCroppedEvent): void {
    if (event.blob) {
      this.croppedBlob = event.blob;
      this.actualizarPreview(event.blob);
      return;
    }

    if (event.base64) {
      this.base64ToBlob(event.base64).then(blob => {
        this.croppedBlob = blob;
        this.actualizarPreview(blob);
      });
    }
  }

  imageLoaded(): void {
    this.loading = false;
    this.error = '';
  }

  loadImageFailed(): void {
    this.loading = false;
    this.error = 'No se pudo cargar la fotografía seleccionada.';
  }

  zoomIn(): void {
    this.scale = Math.min(this.scale + 0.1, 3);
    this.actualizarTransform();
  }

  zoomOut(): void {
    this.scale = Math.max(this.scale - 0.1, 1);
    this.actualizarTransform();
  }

  onZoomChange(event: Event): void {
    this.scale = Number((event.target as HTMLInputElement).value);
    this.actualizarTransform();
  }

  rotateLeft(): void {
    this.rotation -= 90;
    this.actualizarTransform();
  }

  rotateRight(): void {
    this.rotation += 90;
    this.actualizarTransform();
  }

  confirmarRecorte(): void {
    if (!this.croppedBlob) {
      this.error = 'Ajusta la fotografía antes de continuar.';
      return;
    }

    const file = new File(
      [this.croppedBlob],
      `evidencia_${Date.now()}.jpg`,
      { type: 'image/jpeg', lastModified: Date.now() }
    );

    this.confirmar.emit(file);
  }

  cancelarEdicion(): void {
    this.limpiarPreview();
    this.cancelar.emit();
  }

  private actualizarTransform(): void {
    this.transform = {
      ...this.transform,
      scale: this.scale,
      rotate: this.rotation
    };
  }

  private resetEditor(): void {
    this.loading = true;
    this.error = '';
    this.scale = 1;
    this.rotation = 0;
    this.croppedBlob = null;
    this.limpiarPreview();
    this.transform = { scale: 1, rotate: 0 };
  }

  private actualizarPreview(blob: Blob): void {
    this.limpiarPreview();
    this.previewUrl = URL.createObjectURL(blob);
  }

  private limpiarPreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }

  private async base64ToBlob(base64: string): Promise<Blob> {
    const response = await fetch(base64);
    return await response.blob();
  }
}
