<#
Corre a Claude Code en modo no interactivo para revisar el repo, crear un commit
y publicar los cambios en el branch actual y en main.

Uso: pnpm publicar:cambios
     (o directamente) pwsh scripts/publicar-cambios.ps1
#>

$ErrorActionPreference = "Stop"

$prompt = @'
Revisa los cambios actuales del repositorio y realiza el proceso completo de commit y publicación:

1. Revisa primero `git status` y los cambios pendientes.
2. Crea un commit con un mensaje claro y profesional que describa únicamente los cambios realizados.
3. Haz push del branch actual al repositorio remoto.
4. Haz push directo a `main` con los cambios correspondientes.
5. Verifica al final que tanto el branch actual como `main` hayan quedado sincronizados correctamente con el repositorio remoto.
6. No hagas cambios de código que no sean necesarios para completar este proceso.

### Reglas importantes para Git

* Los commits **no deben contener ninguna referencia a Claude, Anthropic, AI, assistant, co-author, contributor ni herramientas de IA**.
* No agregues líneas como `Co-authored-by`.
* No agregues trailers, firmas, metadata ni comentarios relacionados con IA.
* El mensaje del commit debe describir exclusivamente el trabajo realizado en el código.
* No modifiques autores, usuarios o configuraciones de Git existentes salvo que sea estrictamente necesario para evitar referencias a IA.
* Antes de hacer push, verifica el contenido final del commit para asegurarte de que no contiene ninguna referencia a Claude o herramientas de IA.
* No crees commits adicionales innecesarios.
* Si el branch actual no es `main`, conserva el branch y publícalo en el remoto además de actualizar `main`.

Al finalizar, muestra:

* Branch actual.
* Hash del commit creado.
* Mensaje del commit.
* Resultado del push del branch actual.
* Resultado del push a `main`.
* Confirmación de que no se agregó ninguna referencia de IA al commit.
'@

Write-Host "Invocando a Claude Code para revisar, commitear y publicar los cambios..." -ForegroundColor Cyan

claude -p $prompt --permission-mode acceptEdits
