# Git Commands for PowerShell - Quick Reference

## ✅ RECOMMENDED Commands

### Stage Changes
```powershell
git add .                    # Stage all changes in current directory
git add src/                 # Stage specific directory
git add file.js              # Stage specific file
```

### Commit (Single Line)
```powershell
git commit -m "fix: Description here"
git commit -m "feat: Add new feature - Details here"
```

### Commit (Multi-line with Editor)
```powershell
git commit                   # Opens Notepad for detailed message
```

### Push
```powershell
git push origin main
```

### Status & Log
```powershell
git status
git log --oneline -5        # Last 5 commits
```

## ❌ AVOID in PowerShell

### These can cause hanging:
```powershell
# DON'T USE:
git add -A                   # Can hang in PowerShell
git commit -m "Line 1        # Multi-line strings cause issues
Line 2"
```

## 🎯 Best Practices

1. **Use `git add .`** instead of `git add -A`
2. **Keep commit messages on one line** when using `-m`
3. **Use hyphens or semicolons** to separate multiple points:
   ```powershell
   git commit -m "fix: Room layout - Larger boxes - Added End Call button"
   ```

4. **For detailed messages**, use the editor:
   ```powershell
   git commit  # Opens Notepad where you can write multiple lines
   ```

## 📝 Commit Message Format

```
<type>: <description> - <detail1> - <detail2>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance tasks

## 🚀 Complete Workflow Example

```powershell
# Make changes to files...

# Check what changed
git status

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "feat: Add AI voice agent - Integrated ElevenLabs - Updated room layout"

# Push to GitHub
git push origin main
```

---

*Note: These guidelines are specific to PowerShell on Windows. Linux/Mac terminals handle multi-line strings differently.*
