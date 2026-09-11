import{Injectable}from'@angular/core';import{HttpClient}from'@angular/common/http';import{environment}from'../../../../environments/environment';import{CatalogoItem,InventarioDetalle,InventarioResumen,ProductoAdmin,ProductoInventario,StockActual}from'../models/inventario.models';
@Injectable({providedIn:'root'}) export class InventarioApiService{
 private api=environment.apiUrl;constructor(private http:HttpClient){}
 iniciarInventario(){return this.http.post<InventarioResumen>(`${this.api}/api/inventarios`,{});}
 productosPermitidos(id:number){return this.http.get<ProductoInventario[]>(`${this.api}/api/inventarios/${id}/productos`);}
 guardarDetalle(id:number,productos:{productoId:number;cantidad:number}[]){return this.http.put<InventarioDetalle>(`${this.api}/api/inventarios/${id}/detalle`,{productos});}
 finalizar(id:number){return this.http.post<InventarioDetalle>(`${this.api}/api/inventarios/${id}/finalizar`,{});}
 historial(){return this.http.get<any>(`${this.api}/api/inventarios?page=0&size=50`);}
 detalle(id:number){return this.http.get<InventarioDetalle>(`${this.api}/api/inventarios/${id}`);}
 stock(){return this.http.get<StockActual[]>(`${this.api}/api/inventario/stock`);}
 productosAdmin(){return this.http.get<ProductoAdmin[]>(`${this.api}/api/inventario/productos`);}
 crearProducto(payload:any){return this.http.post<ProductoAdmin>(`${this.api}/api/inventario/productos`,payload);}
 catalogo(tipo:'categorias'|'ambitos'|'roles'|'plazas'){return this.http.get<CatalogoItem[]>(`${this.api}/api/inventario/catalogos/${tipo}`);}
}