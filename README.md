# MediaFire Vercel Direct Download API

Vercel-ready API for generating MediaFire direct download links.

## Endpoint

```txt
GET /api/mediafire?link=MEDIAFIRE_LINK
```

Example after deployment:

```txt
https://your-project.vercel.app/api/mediafire?link=https://www.mediafire.com/file/xxxx/file.zip/view
```

## Response format

```json
{
  "status": "true",
  "data": {
    "file": {
      "url": {
        "directDownload": "https://downloadxxx.mediafire.com/...",
        "original": "https://www.mediafire.com/file/..."
      },
      "metadata": {
        "name": "file name",
        "size": {
          "readable": "10 MB"
        }
      }
    }
  }
}
```

## Deploy sa Vercel

1. Upload lahat ng files sa GitHub repo.
2. Open Vercel.
3. Add New Project.
4. Import mo yung GitHub repo.
5. Deploy.
6. Test:
   `/api/mediafire?link=YOUR_MEDIAFIRE_LINK`

## Notes

- No API key.
- MediaFire only.
- Scraper-based ito, kaya puwedeng masira kapag binago ng MediaFire ang page structure.
- Gamitin lang sa files na may karapatan kang i-download/share.
