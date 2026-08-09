# POST /projects/:id/commits — Sample Request

## Endpoint
```
POST http://localhost:4000/projects/{projectId}/commits
Content-Type: multipart/form-data
```

## Fields
| Field | Type | Description |
|-------|------|-------------|
| photo | file | Image file (jpg/png/gif/webp/heic), max 20MB |
| note  | text | Optional user note describing what was done |

## Example curl
```bash
curl -X POST http://localhost:4000/projects/proj_de8fd018-5d55-4f98-99d2-fef714c70ac1/commits \
  -F "photo=@chassis-assembled.jpg" \
  -F "note=Finished assembling the chassis and mounting both motors. Moved battery holder to the back for balance."
```

## PowerShell equivalent
```powershell
$form = @{
  photo = Get-Item ".\test-photo.jpg"
  note  = "Finished assembling the chassis and mounting both motors."
}
Invoke-RestMethod -Uri "http://localhost:4000/projects/$projectId/commits" `
  -Method POST -Form $form
```
