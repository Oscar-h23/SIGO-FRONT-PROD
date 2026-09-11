import{Component,HostListener,signal}from'@angular/core';import{Router,RouterLink,RouterLinkActive,RouterOutlet}from'@angular/router';import{AuthService}from'../../core/auth/auth.service';import{ModuloSigo}from'../../core/auth/auth.models';
@Component({selector:'app-main-layout',standalone:true,imports:[RouterOutlet,RouterLink,RouterLinkActive],templateUrl:'./main-layout.component.html',styleUrl:'./main-layout.component.css'})
export class MainLayoutComponent{
 sidebarOpen=signal(false);collapsed=signal(false);year=new Date().getFullYear();
 constructor(public auth:AuthService,private router:Router){}
 has(m:ModuloSigo){return this.auth.tieneModulo(m)}
 toggle(){innerWidth<=900?this.sidebarOpen.update(v=>!v):this.collapsed.update(v=>!v)}
 close(){if(innerWidth<=900)this.sidebarOpen.set(false)}
 logout(){this.auth.logout();this.router.navigateByUrl('/login')}
 @HostListener('window:resize') resize(){if(innerWidth>900)this.sidebarOpen.set(false)}
}