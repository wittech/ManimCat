param(
  [string[]]$Remotes = @('space', 'space-show'),
  [string]$SourceBranch = 'main',
  [string]$TempBranch = '__space-sync-tmp'
)

$ErrorActionPreference = 'Stop'

$excludePatterns = @(
  'public/readme-images/*.png',
  'src/audio/tracks/*.mp3'
)

function Assert-Success([string]$message) {
  if ($LASTEXITCODE -ne 0) {
    throw $message
  }
}

$current = (git branch --show-current).Trim()
Assert-Success 'Failed to read current branch.'
if ($current -ne $SourceBranch) {
  throw "Error: please checkout $SourceBranch first"
}

$status = git status --porcelain
Assert-Success 'Failed to check working tree status.'
if (-not [string]::IsNullOrWhiteSpace($status)) {
  throw 'Error: working tree not clean, please commit or stash first'
}

$createdTempBranch = $false

try {
  git checkout --orphan $TempBranch | Out-Null
  Assert-Success 'Failed to create orphan temp branch.'
  $createdTempBranch = $true

  git add -A
  Assert-Success 'Failed to stage files on temp branch.'

  foreach ($pattern in $excludePatterns) {
    git rm -rf --cached --ignore-unmatch $pattern 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Warning: failed to exclude pattern: $pattern"
    }
  }

  $head = (git log $SourceBranch -1 --format='%h %s').Trim()
  Assert-Success "Failed to get latest commit from $SourceBranch."

  git commit -m "Sync from ${SourceBranch}: $head" | Out-Null
  Assert-Success 'Failed to create sync snapshot commit.'

  foreach ($remote in $Remotes) {
    Write-Host "Pushing to $remote..."
    git push $remote "${TempBranch}:main" --force
    if ($LASTEXITCODE -eq 0) {
      Write-Host "  ? $remote pushed"
    } else {
      Write-Host "  ? $remote push failed"
    }
  }
}
finally {
  if ($createdTempBranch) {
    git checkout -f $SourceBranch | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Warning: failed to switch back to $SourceBranch"
    }

    git branch -D $TempBranch | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Warning: failed to delete temp branch $TempBranch"
    }
  }
}

Write-Host 'Done!'

