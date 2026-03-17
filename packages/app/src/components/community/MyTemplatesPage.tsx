import { useState, type FC } from 'react';
import { MyTemplatesList } from './MyTemplatesList';
import { CreateNewTemplatePage } from './CreateNewTemplatePage';
import { EditTemplatePage } from './EditTemplatePage';
import { useQuery } from '@tanstack/react-query';
import { fetchMyTemplates, myTemplatesQueryKey } from '../../utils/communityTemplates';

export const MyTemplatesPage: FC = () => {
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: myTemplatesQueryKey,
    queryFn: fetchMyTemplates,
  });

  if (isCreatingNew) {
    return <CreateNewTemplatePage onClose={() => setIsCreatingNew(false)} />;
  }

  if (editingTemplate) {
    return (
      <EditTemplatePage
        template={data?.find((template) => template.id === editingTemplate)!}
        onClose={() => setEditingTemplate(null)}
      />
    );
  }

  return (
    <MyTemplatesList
      templates={data ?? []}
      onCreateNew={() => setIsCreatingNew(true)}
      onEditTemplate={(template) => setEditingTemplate(template.id)}
    />
  );
};
