-- ASTM D6433-07 Appendix X1 reference photos for the Reference Data "View criteria" dialog.
-- Like the curve figures they come from the licensed standard, so they stay out of the app
-- bundle and git and live in the same private 'astm-figures' bucket (admin read only, signed
-- links): d6433-07/severity/<code>-<level>.jpg, or d6433-07/severity/<code>.jpg when the
-- standard shows one photo for the whole distress. The photos are grayscale scans, so they are
-- stored as compressed JPEG (about 35 KB each) instead of PNG; this allows JPEG in the bucket.

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg']
where id = 'astm-figures';
