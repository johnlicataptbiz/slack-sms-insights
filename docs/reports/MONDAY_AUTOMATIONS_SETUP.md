# Monday.com Automations Setup Guide

## ⚠️ Important: Automations must be created manually in Monday.com UI
Monday's API does not support creating automations. These must be set up in the board settings.

---

## Personal Booked Calls Board (`18404975822`)

### Automation 1: Move to "Past / Completed" when Date Held is in the past
```
WHEN Date Held changes AND Date Held < today
THEN Move item to group "Past / Completed"
```

### Automation 2: Move to "Today" when Date Held is today
```
WHEN Date Held changes AND Date Held = today
THEN Move item to group "Today"
```

### Automation 3: Move to "Tomorrow" when Date Held is tomorrow
```
WHEN Date Held changes AND Date Held = tomorrow
THEN Move item to group "Tomorrow"
```

### Automation 4: Move to "This Week" when Date Held is within next 7 days
```
WHEN Date Held changes AND Date Held > tomorrow AND Date Held <= 7 days from now
THEN Move item to group "This Week"
```

### Automation 5: Notify when Needs Reminder is "Yes"
```
WHEN Needs Reminder equals "Yes"
THEN Send notification to "Setter" column
```

---

## SMS Reports Board (`18404975829`)

### Automation 1: Move to "Current Quarter" for recent items
```
WHEN Week Start is within last 90 days
THEN Move item to group "Current Quarter"
```

### Automation 2: Move to "Previous Quarter" for older items
```
WHEN Week Start is before 90 days ago AND Week Start > 180 days ago
THEN Move item to group "Previous Quarter"
```

### Automation 3: Notify when Health is "Action"
```
WHEN Health changes TO "Action"
THEN Send notification to "Owner"
```

---

## SMS Sequences Board (`18404975834`)

### Automation 1: Move to "Top Performers" when Booking Rate > 5%
```
WHEN Booking Rate % > 5
THEN Move item to group "Top Performers"
```

### Automation 2: Move to "Needs Optimization" when Booking Rate < 2%
```
WHEN Booking Rate % < 2
THEN Move item to group "Needs Optimization"
```

### Automation 3: Move to "Testing / New" when Status = "Testing"
```
WHEN Status changes TO "Testing"
THEN Move item to group "Testing / New"
```

---

## How to Set Up in Monday.com

1. Open the board
2. Click **"Automations"** button (lightning bolt icon)
3. Click **"Create automation"**
4. Select trigger from the left dropdown
5. Select condition (if needed)
6. Select action from the right dropdown
7. Click **"Create automation"**

## Tips
- Use descriptive names for your automations
- Test each automation with a sample item
- Automations run in order, so prioritize the most important ones
- You can have multiple triggers for the same action
