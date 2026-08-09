# DC Ultimate Configuration & Storage Schema

## Storage Schema Version: `1.0.0`

### Keys Specification
```json
{
  "schemaVersion": "1.0.0",
  "settings": {
    "theme": "system",
    "enableHoverPreview": true,
    "enableReadingLayout": false,
    "enableNavigationShortcuts": true,
    "enableUrlRedirect": false,
    "enableSearchEngine": true,
    "enableUserNotes": true,
    "enableCommentTools": true,
    "enableMediaTools": true,
    "enableAutomation": true,
    "enableAIFeatures": true
  },
  "galleryProfiles": {},
  "filters": {
    "rules": [
      {
        "id": "rule_1",
        "name": "광고 차단",
        "titlePattern": "대출",
        "action": "HIDE",
        "priority": 10
      }
    ]
  },
  "userNotes": {},
  "bookmarks": [],
  "searchProfiles": [],
  "searchHistory": [],
  "automationRules": [],
  "statistics": {
    "postsViewed": 0,
    "commentsViewed": 0,
    "filteredCount": 0
  },
  "aiSettings": {
    "provider": "local",
    "apiKey": "",
    "endpoint": ""
  }
}
```
