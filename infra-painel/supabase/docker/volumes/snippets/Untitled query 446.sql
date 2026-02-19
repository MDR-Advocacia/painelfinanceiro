
-- Create setores table
CREATE TABLE public.setores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('operacional', 'administrativo')),
  sede_id UUID,
  periodos JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sedes table
CREATE TABLE public.sedes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  periodos JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sedes ENABLE ROW LEVEL SECURITY;

-- Setores policies
CREATE POLICY "Users can view own setores" ON public.setores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own setores" ON public.setores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own setores" ON public.setores FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own setores" ON public.setores FOR DELETE USING (auth.uid() = user_id);

-- Sedes policies
CREATE POLICY "Users can view own sedes" ON public.sedes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sedes" ON public.sedes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sedes" ON public.sedes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sedes" ON public.sedes FOR DELETE USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_setores_updated_at BEFORE UPDATE ON public.setores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sedes_updated_at BEFORE UPDATE ON public.sedes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
