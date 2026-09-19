import{Component,signal}from'@angular/core';
import{FormsModule}from'@angular/forms';
import{Router}from'@angular/router';
import{AuthService}from'../../core/auth/auth.service';

@Component({selector:'app-login',standalone:true,imports:[FormsModule],templateUrl:'./login.component.html',styleUrl:'./login.component.css'})
export class LoginComponent{
 codigo:number|null=null;password='';loading=signal(false);error=signal('');
 constructor(private auth:AuthService,private router:Router){}
 async entrar(){
   if(!this.codigo||!this.password){this.error.set('Ingresa tu código y contraseña.');return;}
   this.loading.set(true);this.error.set('');
   try{
     await this.auth.login(this.codigo,this.password);
     if(this.auth.requiereCambio())this.router.navigateByUrl('/cambiar-password');
     else if(this.auth.tieneRol('OPERADOR'))this.router.navigateByUrl('/programacion/mi-horario');
     else this.router.navigateByUrl('/');
   }catch(e:any){this.error.set(e?.error?.message??'No se pudo iniciar sesión.');}
   finally{this.loading.set(false);}
 }
}
