# Contributing

Thanks for helping improve Sakura.

Before opening a pull request:

1. Keep changes focused and preserve existing learning data formats.
2. Do not commit `node_modules`, build outputs, APKs, EXEs, signing keys,
   databases, or generated audio caches.
3. Run the lightweight checks:

   ```powershell
   node work/test-free-edition.js
   node work/installer-build/work/test-planner-regression.js
   ```

4. For content changes, include the source or rationale and avoid
   duplicating existing entries.
5. For audio changes, include the source, license, processing steps, and
   the generated file manifest update.

Please do not add copyrighted third-party material without permission.

