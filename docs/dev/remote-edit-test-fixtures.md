# Remote Edit Test Fixtures

Automated remote-edit integration tests use an in-memory fake SFTP root and temporary local cache directories. They must not read or write production paths.

Manual real-server smoke is allowed only under the approved disposable root:

- Host/profile: `sge`
- Remote root: `/mnt/gpfs1/Users/zhouwenxiong/CoFinder_test`
- Local temp root: inside the CoFinder project or `~/CoFinderSmokeTest/local`

Required manual cases before a release candidate:

- happy-path edit, save, and upload;
- remote-changed conflict;
- upload failure preservation;
- disconnect while an edit session is active;
- app shutdown cleanup/warning behavior.
