--
-- PostgreSQL database dump
--

-- Dumped from database version 17.0 (Debian 17.0-1.pgdg120+1)
-- Dumped by pg_dump version 17.0 (Debian 17.0-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.api_keys (
    key text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used timestamp with time zone
);


ALTER TABLE public.api_keys OWNER TO sketch_user;

--
-- Name: last_processed_timestamps; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.last_processed_timestamps (
    room_id text NOT NULL,
    last_timestamp timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.last_processed_timestamps OWNER TO sketch_user;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    room_id uuid,
    user_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_system boolean DEFAULT false,
    is_file_upload boolean DEFAULT false,
    is_bot boolean DEFAULT false,
    llm_required boolean DEFAULT false,
    message_type character varying(50)
);


ALTER TABLE public.messages OWNER TO sketch_user;

--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: sketch_user
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.messages_id_seq OWNER TO sketch_user;

--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sketch_user
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.platform_settings (
    id integer NOT NULL,
    admin_key text NOT NULL,
    system_prompt text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    shown boolean DEFAULT false,
    evidence_processor_prompt text,
    sketch_operator_prompt text
);


ALTER TABLE public.platform_settings OWNER TO sketch_user;

--
-- Name: platform_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: sketch_user
--

CREATE SEQUENCE public.platform_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.platform_settings_id_seq OWNER TO sketch_user;

--
-- Name: platform_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sketch_user
--

ALTER SEQUENCE public.platform_settings_id_seq OWNED BY public.platform_settings.id;


--
-- Name: processed_messages; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.processed_messages (
    message_id text NOT NULL,
    processed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.processed_messages OWNER TO sketch_user;

--
-- Name: room_participants; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.room_participants (
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    active boolean DEFAULT true,
    is_owner boolean DEFAULT false,
    recovery_key text,
    team_id integer,
    last_ping timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20)
);


ALTER TABLE public.room_participants OWNER TO sketch_user;

--
-- Name: rooms; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.rooms (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    secret_key text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    owner_id uuid,
    active boolean DEFAULT true,
    sketch_id integer,
    co_owners uuid[] DEFAULT '{}'::uuid[]
);


ALTER TABLE public.rooms OWNER TO sketch_user;

--
-- Name: teams; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.teams (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.teams OWNER TO sketch_user;

--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: sketch_user
--

CREATE SEQUENCE public.teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.teams_id_seq OWNER TO sketch_user;

--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sketch_user
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.teams.id;


--
-- Name: uploaded_files; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.uploaded_files (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid,
    sketch_id integer NOT NULL,
    filename character varying(255) NOT NULL,
    original_filename character varying(255) NOT NULL,
    file_path text NOT NULL,
    file_size bigint NOT NULL,
    file_type character varying(10) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed boolean DEFAULT false,
    processing_error text,
    processed_at timestamp with time zone,
    uploader_username character varying(255),
    uploader_team character varying(255)
);


ALTER TABLE public.uploaded_files OWNER TO sketch_user;

--
-- Name: user_activity; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.user_activity (
    user_id character varying(255) NOT NULL,
    last_activity timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_activity OWNER TO sketch_user;

--
-- Name: users; Type: TABLE; Schema: public; Owner: sketch_user
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    username character varying(255) NOT NULL,
    team_id integer
);


ALTER TABLE public.users OWNER TO sketch_user;

--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: platform_settings id; Type: DEFAULT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.platform_settings ALTER COLUMN id SET DEFAULT nextval('public.platform_settings_id_seq'::regclass);


--
-- Name: teams id; Type: DEFAULT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.teams ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);


--
-- Data for Name: api_keys; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.api_keys (key, created_at, last_used) FROM stdin;
m00z389r3zfm3illlkj34h	2024-10-28 20:44:14.384096+00	\N
\.


--
-- Data for Name: last_processed_timestamps; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.last_processed_timestamps (room_id, last_timestamp, updated_at) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.messages (id, room_id, user_id, content, created_at, is_system, is_file_upload, is_bot, llm_required, message_type) FROM stdin;
\.


--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.platform_settings (id, admin_key, system_prompt, created_at, updated_at, shown, evidence_processor_prompt, sketch_operator_prompt) FROM stdin;
\.


--
-- Data for Name: processed_messages; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.processed_messages (message_id, processed_at) FROM stdin;
\.


--
-- Data for Name: room_participants; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.room_participants (room_id, user_id, joined_at, active, is_owner, recovery_key, team_id, last_ping, status) FROM stdin;
\.


--
-- Data for Name: rooms; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.rooms (id, name, secret_key, created_at, owner_id, active, sketch_id, co_owners) FROM stdin;
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.teams (id, name, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: uploaded_files; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.uploaded_files (id, room_id, sketch_id, filename, original_filename, file_path, file_size, file_type, created_at, processed, processing_error, processed_at, uploader_username, uploader_team) FROM stdin;
\.


--
-- Data for Name: user_activity; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.user_activity (user_id, last_activity) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: sketch_user
--

COPY public.users (id, username, team_id) FROM stdin;
\.


--
-- Name: messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sketch_user
--

SELECT pg_catalog.setval('public.messages_id_seq', 1, false);


--
-- Name: platform_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sketch_user
--

SELECT pg_catalog.setval('public.platform_settings_id_seq', 1, false);


--
-- Name: teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sketch_user
--

SELECT pg_catalog.setval('public.teams_id_seq', 1, true);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (key);


--
-- Name: last_processed_timestamps last_processed_timestamps_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.last_processed_timestamps
    ADD CONSTRAINT last_processed_timestamps_pkey PRIMARY KEY (room_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: processed_messages processed_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.processed_messages
    ADD CONSTRAINT processed_messages_pkey PRIMARY KEY (message_id);


--
-- Name: room_participants room_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_pkey PRIMARY KEY (room_id, user_id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: teams teams_name_key; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_name_key UNIQUE (name);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: uploaded_files uploaded_files_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_pkey PRIMARY KEY (id);


--
-- Name: user_activity user_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_pkey PRIMARY KEY (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_messages_room; Type: INDEX; Schema: public; Owner: sketch_user
--

CREATE INDEX idx_messages_room ON public.messages USING btree (room_id);


--
-- Name: idx_messages_user; Type: INDEX; Schema: public; Owner: sketch_user
--

CREATE INDEX idx_messages_user ON public.messages USING btree (user_id);


--
-- Name: idx_room_participants_recovery; Type: INDEX; Schema: public; Owner: sketch_user
--

CREATE INDEX idx_room_participants_recovery ON public.room_participants USING btree (room_id, recovery_key);


--
-- Name: idx_room_participants_room; Type: INDEX; Schema: public; Owner: sketch_user
--

CREATE INDEX idx_room_participants_room ON public.room_participants USING btree (room_id);


--
-- Name: idx_room_participants_user; Type: INDEX; Schema: public; Owner: sketch_user
--

CREATE INDEX idx_room_participants_user ON public.room_participants USING btree (user_id);


--
-- Name: idx_rooms_owner; Type: INDEX; Schema: public; Owner: sketch_user
--

CREATE INDEX idx_rooms_owner ON public.rooms USING btree (owner_id);


--
-- Name: messages messages_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: messages messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: room_participants room_participants_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: room_participants room_participants_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: room_participants room_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: uploaded_files uploaded_files_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: users users_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sketch_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- PostgreSQL database dump complete
--

