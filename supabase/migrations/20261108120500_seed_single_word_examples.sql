-- Ensure common single-token examples are present in the live dictionary.
insert into public.dictionary_words(language,word,normalized)
values
 ('vi','nhà','nhà'),('vi','hoa','hoa'),('vi','lá','lá'),('vi','sữa','sữa'),
 ('vi','mèo','mèo'),('vi','cây','cây'),('vi','chim','chim'),('vi','mưa','mưa'),
 ('vi','gió','gió'),('vi','nắng','nắng'),('vi','sách','sách'),('vi','nước','nước'),
 ('en','flowers','flowers')
on conflict (language,normalized) do nothing;