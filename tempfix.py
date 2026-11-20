from pathlib import Path

fp = Path('c:/Users/salmo/Desktop/GUC/Engineering Year 3/Semester 6/Software Engineering/Bug-Busters/src/routes/dashboard.projects.tsx')
text = fp.read_text(encoding='utf-8')
start = text.index('<<<<<<< HEAD')
end = text.index('>>>>>>> 18f7c9801713b8896fe7cb71840b8fdcf0e09fad', start) + len('>>>>>>> 18f7c9801713b8896fe7cb71840b8fdcf0e09fad')
replacement = '''            <Select value={kind} onValueChange={(v) => setKind(v as "course" | "bachelor")} disabled={canEditLimited}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>'''
text = text[:start] + replacement + text[end:]
fp.write_text(text, encoding='utf-8')
print('done')
