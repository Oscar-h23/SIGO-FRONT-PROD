import{Component,HostListener,signal}from'@angular/core';
import{Router,RouterLink,RouterLinkActive,RouterOutlet}from'@angular/router';
import{AuthService}from'../../core/auth/auth.service';
import{ModuloSigo}from'../../core/auth/auth.models';
import{ChatComponent}from'../../features/chat/chat.component';

@Component({selector:'app-main-layout',standalone:true,imports:[RouterOutlet,RouterLink,RouterLinkActive,ChatComponent],templateUrl:'./main-layout.component.html',styleUrl:'./main-layout.component.css'})
export class MainLayoutComponent{
 sidebarOpen=signal(false);collapsed=signal(false);chatOpen=signal(false);year=new Date().getFullYear();
 constructor(public auth:AuthService,private router:Router){}
 has(m:ModuloSigo){return this.auth.tieneModulo(m);}
 puedeUsarChat(){return this.auth.tieneRol('SUPERVISOR','CONTROLADOR')&&this.auth.tieneModulo('CHAT');}
 toggleChat(){if(this.puedeUsarChat())this.chatOpen.update(v=>!v);}
 cerrarChat(){this.chatOpen.set(false);}
 toggle(){innerWidth<=900?this.sidebarOpen.update(v=>!v):this.collapsed.update(v=>!v);}
 close(){if(innerWidth<=900)this.sidebarOpen.set(false);}
 logout(){this.chatOpen.set(false);this.auth.logout();this.router.navigateByUrl('/login');}
 @HostListener('window:resize')resize(){if(innerWidth>900)this.sidebarOpen.set(false);}
}
