# Setup script para MCP Server do Brain (Windows PowerShell)

Write-Host "🧠 Brain MCP Server — Setup" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# 1. Build
Write-Host ""
Write-Host "1️⃣  Construindo servidor..." -ForegroundColor Yellow
npm install
npm run build
Write-Host "✅ Build completo" -ForegroundColor Green

# 2. Encontrar arquivo de config
Write-Host ""
Write-Host "2️⃣  Detectando Claude Desktop..." -ForegroundColor Yellow

$configDir = "$env:APPDATA\Claude"
$configFile = "$configDir\claude_desktop_config.json"

if (-not (Test-Path $configFile)) {
    Write-Host "❌ Arquivo não encontrado: $configFile" -ForegroundColor Red
    Write-Host "    Certifique-se de ter instalado e aberto Claude Desktop uma vez" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Encontrado: $configFile" -ForegroundColor Green

# 3. Ler chave API
Write-Host ""
Write-Host "3️⃣  Configurando chave API..." -ForegroundColor Yellow
$brainApiKey = Read-Host "   Insira sua BRAIN_API_KEY"

if ([string]::IsNullOrEmpty($brainApiKey)) {
    Write-Host "❌ Chave não pode estar vazia" -ForegroundColor Red
    exit 1
}

# 4. Caminho absoluto do servidor
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mcpPath = "$scriptDir\dist\index.js"

Write-Host "✅ MCP Path: $mcpPath" -ForegroundColor Green

# 5. Criar/atualizar config
Write-Host ""
Write-Host "4️⃣  Atualizando configuração..." -ForegroundColor Yellow

$config = Get-Content $configFile | ConvertFrom-Json

if (-not $config.mcpServers) {
    $config | Add-Member -Name 'mcpServers' -Value @{} -MemberType NoteProperty
}

$config.mcpServers.brain = @{
    command = "node"
    args = @($mcpPath)
    env = @{
        BRAIN_API_URL = "https://api.weissmurillo.de/api"
        BRAIN_API_KEY = $brainApiKey
    }
}

$config | ConvertTo-Json -Depth 10 | Set-Content $configFile
Write-Host "✅ Configuração atualizada" -ForegroundColor Green

# 6. Resumo
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ Setup concluído!" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor Cyan
Write-Host "1. Fechar Claude Desktop completamente"
Write-Host "2. Abrir Claude Desktop novamente"
Write-Host "3. A ferramenta 'brain' deve aparecer no menu de assistentes"
Write-Host ""
Write-Host "Para testar:" -ForegroundColor Cyan
Write-Host "   Você: Qual é o contexto do Second Brain?"
Write-Host "   Claude: [vai usar brain-get-context]"
Write-Host ""
