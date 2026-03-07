# Build script to work around file lock issues
Write-Host "Building MediaDl with performance fixes..." -ForegroundColor Green

# Kill any existing processes
taskkill /F /IM MediaDl.exe /T 2>$null
taskkill /F /IM electron.exe /T 2>$null  
taskkill /F /IM node.exe /T 2>$null
Start-Sleep -Seconds 2

# Build frontend
Write-Host "Building frontend..." -ForegroundColor Cyan
npm run frontend:build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed" -ForegroundColor Red
    exit 1
}

# Remove old release directory completely
Write-Host "Cleaning release directory..." -ForegroundColor Cyan
Remove-Item release -Recurse -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Try building with portable target only first
Write-Host "Building portable executable..." -ForegroundColor Cyan
npx electron-builder --win 7z portable --publish=never

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Trying alternative approach..." -ForegroundColor Yellow
    # Try with minimal config
    $env:SKIP_NOTARIZE = "true"
    npx electron-builder --win portable --dir
} else {
    Write-Host "Portable executable built successfully!" -ForegroundColor Green
}

Write-Host "Build process completed!" -ForegroundColor Green
Write-Host "Check release/ folder for built files" -ForegroundColor Cyan
