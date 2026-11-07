-- Synthetic users and assets, never actual identities or provider references.
INSERT INTO auth.users (id,email) VALUES
('11111111-1111-4111-8111-111111111111','host@rentral.example.test'),
('22222222-2222-4222-8222-222222222222','seeker@rentral.example.test'),
('33333333-3333-4333-8333-333333333333','other@rentral.example.test');
UPDATE public."User" SET username=CASE id
WHEN '11111111-1111-4111-8111-111111111111' THEN 'test_host'
WHEN '22222222-2222-4222-8222-222222222222' THEN 'test_seeker'
ELSE 'test_other' END, kyc_verified=true, account_type='individual';
INSERT INTO public."Listing" (id,lister_id,category,text_address,base_rent_amount,asset_metadata,video_path,poster_path,document_path,listing_status,hardware_coordinates,"updatedAt") VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','house','Synthetic Lagos test asset',365000,'{"bedrooms":"2","bathrooms":"2","sizeSqm":"100","amenities":"test"}',
'11111111-1111-4111-8111-111111111111/fixture/video.mp4','11111111-1111-4111-8111-111111111111/fixture/poster.jpg','11111111-1111-4111-8111-111111111111/fixture/title.pdf','active',extensions.ST_SetSRID(extensions.ST_MakePoint(3.4,6.45),4326)::extensions.geography,now());
INSERT INTO storage.objects (bucket_id,name) VALUES
('listings-media','11111111-1111-4111-8111-111111111111/fixture/video.mp4'),
('listings-media','11111111-1111-4111-8111-111111111111/fixture/poster.jpg'),
('compliance-docs','11111111-1111-4111-8111-111111111111/fixture/title.pdf'),
('compliance-docs','33333333-3333-4333-8333-333333333333/fixture/private.pdf'),
('listings-media','11111111-1111-4111-8111-111111111111/fixture/orphan.mp4'),
('listings-media','33333333-3333-4333-8333-333333333333/fixture/private.mp4'),
('profile-avatars','public-avatar.jpg');
INSERT INTO public."Conversation" (id,listing_id,seeker_id,lister_id,"updatedAt") VALUES
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',now());
INSERT INTO public."Message" (id,conversation_id,sender_id,body,client_id) VALUES
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','Synthetic message','client-test-1');
INSERT INTO realtime.messages (topic,extension,payload) VALUES ('rentral:conversation:cccccccc-cccc-4ccc-8ccc-cccccccccccc','broadcast','{"test":true}');
INSERT INTO public."Booking" (id,listing_id,seeker_id,lister_id,kind,status,starts_at,ends_at,amount_kobo,"updatedAt") VALUES
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','inspection','confirmed','2030-01-01T12:00Z','2030-01-01T13:00Z',300000,now());
INSERT INTO public."PaymentIntent" (id,booking_id,user_id,kind,reference,idempotency_key,amount_kobo,customer_email,"updatedAt") VALUES
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','booking','fixture-payment','fixture-booking-payment',300000,'seeker@rentral.example.test',now()),
('ffffffff-ffff-4fff-8fff-ffffffffffff','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','booking','fixture-bad-ledger','fixture-bad-ledger',300000,'seeker@rentral.example.test',now());
